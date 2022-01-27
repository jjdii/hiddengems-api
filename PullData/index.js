const axios = require('axios')
const _ = require('lodash')

module.exports = async function (context, req) {
    const provider = req.body.provider || null
    if (!provider) throw new Error(`'provider' not found in post body`)

    const options = req.body.options || {}

    let coins = []
    

    context.log('------------------------------------')
    context.log(`Starting ${provider} pull.`)
    context.log('------------------------------------')

    try {
        async function getCoinsByPage(page) {
            let httpOptions;
            let dataPath;
            let pricePath;
            let volumePath;

            switch (provider) {
                case 'coingecko':
                    httpOptions = {
                        url: `https://api.coingecko.com/api/v3/coins/markets`,
                        method: 'get',
                        headers: {
                            accept: 'application/json'
                        },
                        params: {
                            vs_currency: 'usd',
                            order: 'market_cap_asc',
                            page,
                            per_page: 250,
                            sparkline: false
                        }
                    }
                    dataPath = ['data']
                    pricePath = ['current_price']
                    volumePath = ['total_volume']
                    break
                case 'coinmarketcap':
                    httpOptions = {
                        url: `https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest`,
                        method: 'get',
                        headers: {
                            'X-CMC_PRO_API_KEY': process.env.COINMARKETCAP_API_KEY,
                            accept: 'application/json'
                        },
                        params: {
                            start: 1 + ((page - 1) * 5000),
                            limit: 5000,
                            sort: 'market_cap',
                            sort_dir: 'asc',
                            price_max: options.price_max,
                            volume_24h_min: options.volume_min
                        }
                    }
                    dataPath = ['data', 0, 'data']
                    pricePath = ['quote', 'USD', 'price']
                    volumePath = ['quote', 'USD', 'volume_24h']
                    break
                default: throw new Error(`Invalid provider: ${provider}. Valid options: 'coingecko', 'coinmarketcap'`)
            }

            context.log(`GET ${_.get(httpOptions, 'url', null)} - page #${page}`)

            const get = await axios(httpOptions)

            const getData = _.get(get, dataPath, []).map((coin) => {
                return {
                    id: coin.id,
                    name: coin.name,
                    symbol: coin.symbol,
                    image: coin.image,
                    price: _.get(coin, pricePath, null),
                    volume: _.get(coin, volumePath, null)
                }
            })

            coins = coins.concat(getData)

            if (getData.length > 0) {
                return getCoinsByPage(page + 1)
            } else {
                return true
            }
        }

        await getCoinsByPage(1)

        if (options.filter) {
            coins = _.uniqBy(coins.filter((coin) => {
                const coinPrice = _.get(coin, 'price', null)
                const coinVolume = _.get(coin, 'volume', null)
                return (coinPrice <= options.price_max && coinVolume >= options.volume_min)
            }), (coin) => coin.id)
        } else {
            coins = _.uniqBy(coins, (coin) => coin.id)
        }

        const coinsLength = coins.length
        context.log('------------------------------------')
        context.log(`Retrieved ${coinsLength} coins from ${provider}.`)
        context.log('------------------------------------')

    } catch (error) {
        throw error
    }

    context.res = {
        body: coins
    };
}