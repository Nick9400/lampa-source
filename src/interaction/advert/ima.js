import Utils from '../../utils/utils'
import Storage from '../../core/storage/storage'
import Platform from '../../core/platform'
import Manifest from '../../core/manifest'
import Personal from '../../core/personal'
import Premium from './premium'
import Metric from '../../services/metric'
import Realm from './realm'

const SDK3_URL = 'https://imasdk.googleapis.com/js/sdkloader/ima3.js'

let sdk2 = null // класс VASTPlayer
let sdk3 = null // пространство google.ima

let sdk2_try = 0
let sdk3_try = 0

function loadSDK(api){
    return api == 3 ? loadSDK3() : loadSDK2()
}

/**
 * VASTPlayer (VAST 2). Живёт в изолированном контексте, в window страницы не попадает
 * @returns {Promise} resolve(VASTPlayer)
 */
function loadSDK2(){
    if(sdk2) return Promise.resolve(sdk2)

    if(sdk2_try > 1) return Promise.reject(new Error('VASTPlayer SDK load failed after multiple attempts'))

    sdk2_try++

    return Realm.load(Manifest.github_lampa + '/vender/vast/vast.js', 'VASTPlayer').then((lib)=>{
        sdk2 = lib.exports

        // библиотека отдаёт ответ VAST в этот хук, пробрасываем его на страницу для логов
        lib.window.adv_logs_responce_event = (e)=>{
            if(typeof window.adv_logs_responce_event == 'function') window.adv_logs_responce_event(e)
        }

        return sdk2
    })
}

/**
 * Google IMA (VAST 3). Живёт в изолированном контексте, в window страницы не попадает
 * @returns {Promise} resolve(google.ima)
 */
function loadSDK3(){
    if(sdk3) return Promise.resolve(sdk3)

    if(sdk3_try > 1) return Promise.reject(new Error('IMA SDK load failed after multiple attempts'))

    sdk3_try++

    return Realm.load(SDK3_URL, 'google', {marker: true}).then((lib)=>{
        if(!lib.exports.ima) throw new Error('IMA namespace not found')

        sdk3 = lib.exports.ima

        return sdk3
    })
}

function buildUrl(url){
    let movie        = Storage.get('activity', '{}').movie
    let movie_genres = []
    let movie_id     = movie ? movie.id : 0
    let movie_imdb   = movie ? movie.imdb_id : ''
    let movie_type   = movie ? (movie.original_name ? 'tv' : 'movie') : 'movie'

    try{
        movie_genres = movie.genres.map(g=>g.id)
    }
    catch(e){}

    let pixel_ratio = window.devicePixelRatio || 1

    let u = url.replace('{RANDOM}',Math.round(Date.now() * Math.random()))
        u = u.replace(/{TIME}/g,Date.now())
        u = u.replace(/{WIDTH}/g, Math.round(window.innerWidth * pixel_ratio))
        u = u.replace(/{HEIGHT}/g, Math.round(window.innerHeight * pixel_ratio))
        u = u.replace(/{PLATFORM}/g, Platform.get())
        u = u.replace(/{UID}/g, encodeURIComponent(getUid()))
        u = u.replace(/{PIXEL}/g, pixel_ratio)
        u = u.replace(/{GUID}/g, encodeURIComponent(getGuid()))
        u = u.replace(/{MOVIE_ID}/g, movie_id)
        u = u.replace(/{MOVIE_GENRES}/g, movie_genres.join(','))
        u = u.replace(/{MOVIE_IMDB}/g, movie_imdb)
        u = u.replace(/{MOVIE_TYPE}/g, movie_type)
        u = u.replace(/{SCREEN}/g, encodeURIComponent(Platform.screen('tv') ? 'tv' : 'mobile'))

    return u
}

function getGuid() {
    let guid = Storage.get('vast_device_guid', '')

    if(!guid || guid.indexOf('00000000') === 0){
        guid = Utils.guid()

        Storage.set('vast_device_guid', guid)
    }

    return guid
}

function getUid(){
    let uid = Storage.get('vast_device_uid', '')

    if(!uid){
        uid = Utils.uid(15)

        Storage.set('vast_device_uid', uid)
    }

    return uid
}

/**
 * Можно ли показывать рекламу для текущего воспроизведения
 * @param {Object} session - снимок данных плеера (AdSession)
 * @returns {Boolean}
 */
function canShow(session){
    if(session.any) return false

    if(window.lampa_settings.developer.ads) return true

    // Пока подтверждение премиума с сервера не получено, рекламу не показываем (защита от показа премиум‑пользователю на старте)
    if(!Premium.settled()) return false

    return !(Premium.active() || Personal.confirm())
}

function metric(stat_name, method, ad_name){
    if(ad_name == 'plugin'){
        let activity = Storage.get('activity', '{}')

        if(activity.component){
            ad_name = activity.component
        }

        Metric.counter('ad_'+stat_name+'_plugin', ad_name, method, Platform.screen('tv') ? 'tv' : 'mobile')
    }
    else{
        Metric.counter('ad_'+stat_name, ad_name, method, Platform.screen('tv') ? 'tv' : 'mobile')
    }
}

export default {
    loadSDK,
    loadSDK2,
    loadSDK3,
    buildUrl,
    getGuid,
    getUid,
    canShow,
    metric
}