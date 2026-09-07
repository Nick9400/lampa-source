import Guard from './guard'
import Manifest from '../../core/manifest'
import Storage from '../../core/storage/storage'

/**
 * Подтверждение премиума для рекламы.
 *
 * Account.hasPremium() опирается на localStorage и Utils.countDays, которые плагин
 * может подменить. Для решения о показе рекламы статус запрашивается у сервера
 * напрямую через нативный XMLHttpRequest и хранится в замыкании. Неподтверждённый
 * премиум = реклама показывается, поэтому любое вмешательство в запрос или токен
 * только включает рекламу, а не выключает её.
 */

const SETTLE_TIMEOUT = 10 * 1000
const RECHECK_EVERY  = 30 * 60 * 1000

let state = {
    settled:  false,
    days:     0,
    token:    null,
    pending:  false,
    verified: 0
}

let waiters = []

function account(){
    let data = Storage.get('account', '{}')

    return data && typeof data == 'object' ? data : {}
}

function days(until){
    if(!until) return 0

    let end = new Date(until).getTime()

    if(isNaN(end)) return 0

    let count = Math.round((end - Guard.time()) / (1000 * 60 * 60 * 24))

    return count <= 0 ? 0 : count
}

function settle(){
    state.settled = true

    let list = waiters

    waiters = []

    list.forEach(call=>{
        try{ call() } catch(e){}
    })
}

/**
 * Запросить статус у сервера
 * @param {Function} [done]
 */
function verify(done){
    let acc   = account()
    let token = acc.token

    state.token = token || null

    if(!token || !window.lampa_settings.account_use){
        state.days     = 0
        state.verified = Guard.time()

        settle()

        return done && done()
    }

    if(state.pending) return done && waiters.push(done)

    state.pending = true

    let finish = ()=>{
        state.pending  = false
        state.verified = Guard.time()

        settle()

        if(done) done()
    }

    // Только встроенные зеркала: пользовательские (localStorage cub_mirrors / cub_domain) плагин может подменить своим сервером
    let mirrors = Manifest.cub_mirrors_lampa
    let pos     = 0

    let request = ()=>{
        let domain = mirrors[pos]

        if(!domain){
            // Сеть недоступна: оставляем последнее подтверждённое значение
            console.log('Ad', 'premium verify failed')

            return finish()
        }

        Guard.request(Guard.protocol() + domain + '/api/users/get?device_name=' + encodeURIComponent(Storage.get('device_name', '') + ''), {
            timeout: 8000,
            headers: {
                token: token,
                profile: acc.profile && acc.profile.id !== undefined ? acc.profile.id : undefined
            },
            success: (data)=>{
                if(!data || typeof data != 'object'){
                    pos++

                    return request()
                }

                let user = Guard.has(data, 'user') ? data.user : null

                state.days = user && user.id ? days(user.premium) : 0

                console.log('Ad', 'premium verified', state.days, 'days')

                finish()
            },
            error: ()=>{
                pos++

                request()
            }
        })
    }

    request()
}

/**
 * Проверить, не сменился ли аккаунт, и при необходимости перепроверить
 */
function refresh(){
    let token = account().token || null

    if(token !== state.token){
        state.days = 0

        verify()
    }
    else if(Guard.time() - state.verified > RECHECK_EVERY) verify()
}

function init(){
    verify()

    // Если сервер молчит, не держим рекламу выключенной бесконечно
    Guard.delay(settle, SETTLE_TIMEOUT)

    Guard.interval(refresh, 60 * 1000)
}

/**
 * Первая проверка завершена (или истёк таймаут ожидания)
 * @returns {Boolean}
 */
function settled(){
    return state.settled
}

/**
 * Премиум подтверждён сервером
 * @returns {Boolean}
 */
function active(){
    return state.days > 0
}

export default {
    init,
    verify,
    refresh,
    settled,
    active,
    days: ()=>state.days
}
