import Guard from './guard'
import Subscribe from '../../utils/subscribe'
import Torserver from '../torserver'
import Activity from '../activity/activity'

/**
 * Доверенное состояние воспроизведения для рекламы.
 *
 * Решение «показывать рекламу или нет» принимается по снимку данных плеера,
 * который снимается в самом начале Player.play() — до события 'create'
 * и до любых обработчиков плагинов. Поэтому подмена iptv / vast_url / youtube
 * в обработчиках событий или в обёртке над listener.send на рекламу не влияет.
 *
 * Модуль не экспортируется в window.Lampa.
 */

let listener  = Subscribe()
let pending   = null    // снимок, снятый на входе в Player.play()
let resolved  = null    // снимок, по которому принято решение о прероле
let current   = null    // снимок того, что сейчас воспроизводится
let continued = null    // элемент плейлиста, выбранный при открытом плеере

const VAST_KEYS = ['vast_url', 'vast_msg', 'vast_region', 'vast_platform', 'vast_screen']

function own(data, key){
    return Guard.has(data, key) ? data[key] : undefined
}

function vastFrom(data, into){
    VAST_KEYS.forEach(key => {
        let value = own(data, key)

        if(!into[key] && typeof value == 'string' && value) into[key] = value
    })

    return into
}

/**
 * Снять снимок данных плеера
 * @param {Object} data - данные плеера
 * @returns {Object} снимок
 */
function capture(data){
    data = data && typeof data == 'object' ? data : {}

    let url  = typeof own(data, 'url') == 'string' ? data.url : ''
    let ip   = Torserver.ip()
    let hash = own(data, 'torrent_hash')

    let snapshot = {
        data,
        url,
        iptv:     Boolean(own(data, 'iptv')),
        torrent:  Boolean(hash && ip && url.indexOf(ip) > -1),
        youtube:  Boolean(own(data, 'youtube') && Activity.active().component == 'full' && url.indexOf('youtube.com') > -1),
        continue: Boolean(own(data, 'continue_play') && continued === data),
        vast:     vastFrom(data, {})
    }

    snapshot.any = snapshot.iptv || snapshot.torrent || snapshot.youtube || snapshot.continue

    continued = null
    pending   = snapshot

    return snapshot
}

/**
 * Пометить элемент плейлиста как продолжение просмотра (вызывается плеером)
 * @param {Object} item
 */
function next(item){
    continued = item
}

/**
 * Получить снимок для показа преролла.
 * Плагины могут добавить свою рекламу (vast_url) в 'create', но не могут
 * снять флаги, влияющие на пропуск рекламы.
 * @param {Object} data - данные плеера
 * @returns {Object} снимок
 */
function resolve(data){
    let snapshot = pending && pending.data === data ? pending : capture(data)

    vastFrom(data, snapshot.vast)

    pending  = null
    resolved = snapshot

    return snapshot
}

/**
 * Плеер готов к воспроизведению (вызывается плеером)
 * @param {Object} data - данные плеера
 */
function ready(data){
    current = resolved && resolved.data === data ? resolved : capture(data)

    pending = null

    listener.send('ready', current)
}

/**
 * Плеер закрыт (вызывается плеером)
 */
function destroy(){
    current  = null
    resolved = null

    listener.send('destroy', {})
}

/**
 * Снимок текущего воспроизведения или null, если плеер закрыт
 * @returns {Object|null}
 */
function playing(){
    return current
}

export default {
    listener,
    capture,
    next,
    resolve,
    ready,
    destroy,
    playing
}
