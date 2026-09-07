import Lang from '../../core/lang'
import VPN from '../../core/vpn'
import Controller from '../../core/controller'
import Vast2 from './preroll/v2'
import Vast3 from './preroll/v3'
import Platform from '../../core/platform'
import Background from '../background'
import VastManager from './vast_manager'
import IMA from './ima'
import Metric from '../../services/metric'
import Account from '../../core/account/account'
import Personal from '../../core/personal'
import Session from './session'

let running     = 0
let session     = null
let prerolls_played = []

let Manager = new VastManager({
    api: 'preroll',
    cooling: 1000 * 60 * 5
})

function init(){
    Manager.init()
}

/**
 * Показать преролл
 * @param {Object} preroll - данные для показа рекламы
 * @param {Number} num - номер показа рекламы (для повторов)
 * @param {Function} started - вызывается при запуске рекламы
 * @param {Function} ended - вызывается при окончании рекламы
 * @return {void}
 */
function video(preroll, num, started, ended){
    console.log('Ad', 'preroll launch')

    let advert = preroll.vast_api == 3 ? new Vast3(preroll) : new Vast2(preroll)
    let next   = (mark) => {
        let any = getAnyPreroll()

        mark && Manager.markCooling()

        any ? video(any, num + 1, started, ended) : ended()
    }

    advert.listener.follow('launch', started)

    advert.listener.follow('ended', ()=>{
        num < 2 ? next() : ended()
    })

    advert.listener.follow('error', ()=>{
        Date.now() - running < 15000 && num < 4 ? next() : ended()
    })
}

/**
 * Показать заставку (реклама)
 * @param {Object} preroll - данные для показа рекламы
 * @param {Function} call - вызывается при окончании рекламы
 * @return {void}
 */
function launch(preroll, call){
    let enabled = Controller.enabled().name

    Background.theme('#454545')

    let html = $(`
        <div class="ad-preroll">
            <div class="ad-preroll__bg"></div>
            <div class="ad-preroll__text">${Lang.translate('ad')}</div>
            <div class="ad-preroll__over"></div>
        </div>
    `)

    $('body').append(html)

    setTimeout(()=>{
        html.find('.ad-preroll__bg').addClass('animate')

        setTimeout(()=>{
            html.find('.ad-preroll__text').addClass('animate')
        },500)
    },100)

    setTimeout(()=>{
        html.find('.ad-preroll__over').addClass('animate')

        setTimeout(()=>{
            Controller.toggle(enabled)

            Background.theme('black')

            video(preroll, 1, ()=>{}, ()=>{
                html.remove()

                Background.theme('reset')

                Controller.toggle(enabled)

                call()
            })
        },300)
    },3500)

    Controller.add('ad_preroll',{
        toggle: ()=>{
            Controller.clear()
        },
        enter: ()=>{},
        back: ()=>{}
    })

    Controller.toggle('ad_preroll')
}

/**
 * Получить данные для плагина
 * @param {Object} vast - vast_* поля из снимка данных плеера
 * @return {Object|Boolean} данные для плагина или false, если не показывать
 */
function getVastPlugin(vast){
    let show = true

    if(vast.vast_region && vast.vast_region.split(',').indexOf(VPN.code()) == -1) show = false
    if(vast.vast_platform && vast.vast_platform.split(',').indexOf(Platform.get()) == -1) show = false
    if(vast.vast_screen && vast.vast_screen.split(',').indexOf(Platform.screen('tv') ? 'tv' : 'mobile') == -1) show = false

    if(vast.vast_url && show) return {
        url: vast.vast_url,
        name: 'plugin',
        msg: vast.vast_msg || Lang.translate('ad_plugin')
    }

    return false
}

/**
 * Получить данные для показа рекламы (преролл или плагин)
 * @param {Boolean} first_run - первый запуск (для сброса кулинга)
 * @return {Object|Boolean} данные для показа рекламы или false, если не показывать
 */
function getAnyPreroll(first_run = false){
    let manager = Manager.get(first_run)
    let plugin  = getVastPlugin(session ? session.vast : {})

    let any = Manager.coolingReady() ? manager || plugin : false

    if(any){
        if(prerolls_played.indexOf(any.url) == -1) prerolls_played.push(any.url)
        else any = false
    } 

    return any
}

/**
 * Показать рекламу (преролл или плагин)
 * @param {Object} data - данные плеера
 * @param {Function} call - вызывается при окончании рекламы
 * @return {void}
 */
function show(data, call){
    // Снимок снят на входе в Player.play(), до обработчиков 'create'
    session = Session.resolve(data)

    prerolls_played = []

    // Пометить регион для таргетинга рекламы
    data.ad_region = VPN.code()

    // Не показывать рекламу для iptv/torrent/youtube/continue
    let whoi = Account.hasPremium() ? 'premium' : Personal.confirm() ? 'personal' : 'none'

    Metric.counter('ad_preroll_start', VPN.code(), whoi, session.any ? 'skip' : 'show')

    if(session.any){
        console.log('Ad', 'preroll skipped, no vast api or iptv/torrent/youtube/continue', {
            iptv: session.iptv,
            torrent: session.torrent,
            youtube: session.youtube,
            continue: session.continue
        })

        return call()
    }

    // Бывает что плеер по несколько раз запускается, 
    // проверяем чтобы реклама не запускалась несколько раз подряд
    if(running) return console.log('Ad', 'preroll skipped, already running')
    
    // Помечаем время запуска рекламы
    running = Date.now()

    let ended = ()=>{
        running = 0

        console.log('Ad', 'preroll ended')

        call()
    }

    // Получаем данные для показа рекламы (преролл или плагин)
    let preroll = getAnyPreroll(true)
    let canshow = IMA.canShow(session)

    Metric.counter('ad_preroll_show', VPN.code(), preroll ? 'ready' : 'none', canshow ? 'ready' : 'none')
    Metric.counter('ad_preroll_colling', VPN.code(), Manager.coolingReady() ? 'ready' : 'cooling')

    if(preroll && canshow){
        // Загружаем SDK для выбранного преролла, чтобы он был готов к показу
        IMA.loadSDK(preroll.vast_api).catch(()=>{
            console.log('Ad', 'IMA SDK load error', preroll.vast_api)
        })

        launch(preroll, ended)
    }
    else ended()
}


export default {
    init,
    show
}