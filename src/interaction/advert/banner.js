import IMA from './ima'
import Guard from './guard'
import Watch from './watch'
import Session from './session'
import VastManager from './vast_manager'
import Player from '../player'
import PlayerVideo from '../player/video'
import PlayerPanel from '../player/panel'
import PlayerFooter from '../player/footer'
import Noty from '../noty'
import Lang from '../../core/lang'
import Metric from '../../services/metric'

let Manager = new VastManager({
    api: 'banner',
    cooling: 1000 * 60 * 20
})

let adContainer, adDisplayContainer, adsLoader
let adsManager  = null
let showTimeout = null
let timeout     = 1000 * 60
let banner      = null
let ima         = null
let unwatch     = null

// Ссылка снимается при загрузке модуля, чтобы подмена Lampa.Player.close из плагина не отменяла остановку
const closePlayer = Player.close

function init(){
    Manager.init()

    // Состояние плеера берём из закрытой сессии рекламы, а не из Lampa.Player,
    // чтобы плагины не могли подменить opened()/playdata() или снять слушатели
    Session.listener.follow('ready', ()=>{
        Manager.markCooling()
    })

    Session.listener.follow('destroy', stop)

    PlayerPanel.listener.follow('visible', (e) => resize(e.status ? PlayerPanel.render()[0].offsetHeight : 0))
    PlayerFooter.listener.follow('open', (e) => resize(PlayerFooter.render().offsetHeight))
    PlayerFooter.listener.follow('close', (e) => resize(PlayerPanel.render()[0].offsetHeight))

    let first = true

    Guard.interval(()=>{
        Manager.params.cooling = 1000 * 60 * (window.lampa_settings.developer.enabled ? 2 : 20)

        let session = Session.playing()

        if(session && Manager.coolingReady() && IMA.canShow(session)){
            banner = Manager.get(first)

            console.log('Ad', 'show banner', banner)

            if(banner){
                first = false

                Manager.markCooling()

                stop()
                start()
            }
            else{
                first = true
            }
        }
    }, 1000 * 60)
}

function stat(method){
    IMA.metric('banner', method, banner.name)
}

function resize(panelHeight){
    if(!adContainer) return

    adContainer.style.height = (window.innerHeight - panelHeight - (panelHeight ? 20 : 0)) + 'px'

    if(adsManager && ima){
        let w = adContainer.offsetWidth  || window.innerWidth
        let h = adContainer.offsetHeight || window.innerHeight

        try{ adsManager.resize(w, h, ima.ViewMode.NORMAL) } catch(ex){}
    }
}

function loaded(event) {
    let video = PlayerVideo.video()

    if(!Session.playing()) return

    stat('run')

    let adsRenderingSettings = new ima.AdsRenderingSettings()
        adsRenderingSettings.uiElements = []

    adsManager = event.getAdsManager(video, adsRenderingSettings)

    adsManager.addEventListener(ima.AdEvent.Type.STARTED, (e) => {
        console.log('Ad', 'banner started')

        stat('started')

        showTimeout = Guard.delay(()=>{
            console.log('Ad', 'banner complete')

            stat('complete')

            stop()
        }, timeout)
    })

    adsManager.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, (e) => {
        console.error('Ad', 'manager error', e.getError())

        error(200)

        stop()
    })
    

    let player = Player.render()[0]
    let w = player ? player.offsetWidth  : window.innerWidth
    let h = player ? player.offsetHeight : window.innerHeight

    try{
        adsManager.init(w, h, ima.ViewMode.NORMAL)
        adsManager.start()

        resize(Player.render().hasClass('player--panel-visible'))
    }
    catch(e){
        console.error('Ad', 'init error', e)

        error(300)

        stop()
    }
}

/**
 * Контейнер баннера скрыли или удалили извне: реклама заблокирована, воспроизведение останавливаем
 */
function tampered(reason){
    console.log('Ad', 'banner blocked by third party:', reason)

    stat('tamper')

    Metric.counter('ad_tamper', 'banner', reason)

    stop()

    Noty.show(Lang.translate('ad_blocked'))

    closePlayer()
}

function start(){
    IMA.loadSDK3().then((sdk) => {
        if(!Session.playing()) return

        ima = sdk

        let video = PlayerVideo.video()

        // Контейнер должен быть внутри .player, чтобы IMA SDK
        // правильно рассчитывал позицию overlay относительно видео
        let player = Player.render()[0]

        adContainer = Guard.element('div')
        adContainer.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:10;pointer-events:none;'

        Guard.append(player, adContainer)

        // Пока сам плеер скрыт (например, открыта экранная клавиатура), контейнер не проверяем
        unwatch = Watch.start(adContainer, {
            deep: false,
            skip: ()=> Watch.inspect(player, true) !== null,
            onTamper: tampered
        })

        adDisplayContainer = new ima.AdDisplayContainer(adContainer, video)

        adsLoader = new ima.AdsLoader(adDisplayContainer)

        adsLoader.addEventListener(
            ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED,
            loaded
        )

        adsLoader.addEventListener(
            ima.AdErrorEvent.Type.AD_ERROR,
            (e) => {
                console.error('Ad', 'banner loader error', e.getError())

                error(100)

                stop()
            }
        )

        // initialize() должен вызываться до requestAds() и из пользовательского контекста
        adDisplayContainer.initialize()

        let slotWidth  = player.offsetWidth  || window.innerWidth
        let slotHeight = player.offsetHeight || window.innerHeight

        let request = new ima.AdsRequest()
            request.adTagUrl = IMA.buildUrl(banner.url)

            request.linearAdSlotWidth     = slotWidth
            request.linearAdSlotHeight    = slotHeight
            request.nonLinearAdSlotWidth  = slotWidth
            request.nonLinearAdSlotHeight = Math.round(slotHeight * 0.3)

        adsLoader.requestAds(request)

        stat('launch')
    }).catch((e) => {
        if(e && e.tamper && Session.playing()) return tampered('sdk')

        console.error('Ad', 'banner SDK load failed', e)
    })
}

function error(code){
    IMA.metric('banner', 'error', banner.name)
    IMA.metric('banner', 'error_' + code, banner.name)
}

function stop(){
    if(showTimeout !== null) Guard.clear(showTimeout)

    showTimeout = null

    if(unwatch){
        unwatch()
        unwatch = null
    }

    if(adsManager){
        try{ adsManager.stop(); adsManager.destroy() } catch(e){}
        adsManager = null
    }

    if(adsLoader){
        try{ adsLoader.destroy() } catch(e){}
        adsLoader = null
    }

    if(adContainer){
        Guard.detach(adContainer)
        adContainer = null
    }
}

export default {
    init
}
