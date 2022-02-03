const axios = require('axios')
const _ = require('lodash')
const { PromisePool } = require('@supercharge/promise-pool')

module.exports = async function (context, req) {
    const provider = 'coingecko';
    const options = req.body.options || {}

    let coins = []

    context.log('------------------------------------')
    context.log(`Starting ${provider} pull.`)
    context.log('------------------------------------')

    try {
        async function getCoinsByPage(page) {
            let httpOptions = {
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
            };

            context.log(`GET ${_.get(httpOptions, 'url', null)} - page #${page}`)

            const get = await axios(httpOptions)

            const getData = _.get(get, ['data'], []).map((coin) => {
                return {
                    id: coin.id,
                    name: coin.name,
                    symbol: coin.symbol,
                    image: coin.image,
                    price: _.get(coin, ['current_price'], null),
                    volume: _.get(coin, ['total_volume'], null)
                }
            })

            return getData
        }

        const { results, errors } = await PromisePool
            .withConcurrency(50) // coingecko api limit 50/minute
            .for(_.range(1, 46, 1))
            // .handleError(async (error, data, pool) => {
            //     pool.stop()
            //     console.log(error)
            //     throw error
            //   })
            .process(async (data, index, pool) => {
                const response = await getCoinsByPage(data)
                return response
            })
        
        if (errors.length > 0) {
            throw errors
        }

        if (results) {
            for (const result of results) {
            // results.forEach((result) => {
                coins = coins.concat(...result)
            // })
            }
        }
        
        const coinsLength = coins.length

        if (coinsLength > 0 && options.filter) {
            coins = coins.filter((coin) => {
                const coinPrice = _.get(coin, 'price', null)
                const coinVolume = _.get(coin, 'volume', null)
                return (coinPrice <= options.price_max && coinVolume >= options.volume_min)
            })
        } 

        if (coinsLength > 0 && options.unique) {
            coins = _.uniqBy(coins, (coin) => coin.id)
        }

        
        context.log('------------------------------------')
        context.log(`Retrieved ${coinsLength} coins from ${provider}.`)
        context.log('------------------------------------')

    } catch (error) {
        let errorMessage = 'Something went wrong. Please try again in a minute.'

        if (error.length > 0) {
            error.forEach((err) => {
                if (err.toString().includes('429')) {
                    errorMessage = 'CoinGecko API limit exceeded. Please try again in a minute.'
                    return false;
                }
            })
        } 

        context.res = {
            body: {
                message: errorMessage,
                error
            }
        }
        context.done()
    }

    context.res = {
        body: coins
    }
    context.done()
}