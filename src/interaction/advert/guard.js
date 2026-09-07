/**
 * Доверенные примитивы для рекламного слоя.
 *
 * Плагины загружаются после сборки приложения и могут подменять что угодно
 * в глобальной области: $.ajax / ajaxTransport, XMLHttpRequest, таймеры,
 * методы объектов Lampa.*, геттеры в Object.prototype. Всё, что нужно рекламе,
 * захватывается здесь в момент выполнения бандла, то есть до первого плагина,
 * и дальше используется только через эти ссылки.
 */

let win = typeof window !== 'undefined' ? window : globalThis

// fn.call / fn.apply тоже можно подменить через Function.prototype,
// поэтому вызываем через заранее связанный call
let callOf = Function.prototype.call
let invoke = callOf.bind(callOf)

let hasOwnProperty  = Object.prototype.hasOwnProperty
let defineProperty  = Object.defineProperty
let getDescriptor   = Object.getOwnPropertyDescriptor
let parseJSON       = JSON.parse
let now             = Date.now
let setTimeoutFn    = win.setTimeout
let setIntervalFn   = win.setInterval
let clearTimeoutFn  = win.clearTimeout
let clearIntervalFn = win.clearInterval

let XHR = win.XMLHttpRequest
let xhr = XHR ? XHR.prototype : null

let xhrOpen   = xhr ? xhr.open : null
let xhrSend   = xhr ? xhr.send : null
let xhrAbort  = xhr ? xhr.abort : null
let xhrHeader = xhr ? xhr.setRequestHeader : null
let xhrListen = xhr ? xhr.addEventListener : null

let xhrStatus     = accessor(xhr, 'status')
let xhrReadyState = accessor(xhr, 'readyState')
let xhrResponse   = accessor(xhr, 'responseText')

let doc  = win.document
let Doc  = win.Document ? win.Document.prototype : null
let Nod  = win.Node ? win.Node.prototype : null
let Elem = win.Element ? win.Element.prototype : null
let Frm  = win.HTMLIFrameElement ? win.HTMLIFrameElement.prototype : null

let root            = doc ? doc.documentElement : null
let createElement   = Doc && Doc.createElement ? Doc.createElement : doc ? doc.createElement : null
let appendChild     = Nod ? Nod.appendChild : null
let removeChild     = Nod ? Nod.removeChild : null
let containsNode    = Nod ? Nod.contains : null
let parentNode      = accessor(Nod, 'parentNode')
let isConnected     = accessor(Nod, 'isConnected')
let boundingRect    = Elem ? Elem.getBoundingClientRect : null
let frameWindow     = accessor(Frm, 'contentWindow')
let computedStyle   = win.getComputedStyle
let innerWidthOf    = accessor(win, 'innerWidth')
let innerHeightOf   = accessor(win, 'innerHeight')
let location_protocol = win.location ? win.location.protocol : 'https:'

/**
 * Захватить геттер свойства прототипа
 * @param {Object} proto
 * @param {String} name
 * @returns {Function|null}
 */
function accessor(proto, name){
    if(!proto) return null

    let descriptor

    try{
        descriptor = getDescriptor(proto, name)
    }
    catch(e){}

    return descriptor && descriptor.get ? descriptor.get : null
}

/**
 * Прочитать свойство XHR через захваченный геттер
 * @param {XMLHttpRequest} request
 * @param {Function|null} getter
 * @param {String} name
 */
function read(request, getter, name){
    return getter ? invoke(getter, request) : request[name]
}

/**
 * Собственное свойство объекта (геттеры из прототипа игнорируются)
 * @param {Object} object
 * @param {String} key
 * @returns {Boolean}
 */
function has(object, key){
    return Boolean(object) && typeof object == 'object' && invoke(hasOwnProperty, object, key)
}

/**
 * Запретить перезапись и удаление существующих свойств объекта
 * @param {Object} object
 * @param {Array} keys
 * @returns {Object}
 */
function lock(object, keys){
    if(!object) return object

    keys.forEach(key => {
        let descriptor = has(object, key) ? getDescriptor(object, key) : null

        if(!descriptor || !descriptor.configurable) return

        try{
            // Аксессоры оставляем как есть, только запрещаем переопределение
            if(!has(descriptor, 'value')) defineProperty(object, key, {configurable: false})
            else defineProperty(object, key, {
                value: descriptor.value,
                writable: false,
                configurable: false,
                enumerable: descriptor.enumerable
            })
        }
        catch(e){
            console.error('Ad', 'guard lock failed', key, e)
        }
    })

    return object
}

/**
 * GET запрос через нативный XMLHttpRequest, минуя jQuery и любые обёртки,
 * установленные после загрузки приложения
 * @param {String} url
 * @param {Object} params {timeout, json, success(data, status), error(status)}
 * @returns {Function} прервать запрос
 */
function request(url, params = {}){
    let timeout  = params.timeout || 10000
    let finished = false
    let timer

    let done = (fail, data, status)=>{
        if(finished) return

        finished = true

        invoke(clearTimeoutFn, win, timer)

        if(fail) params.error && params.error(status)
        else params.success && params.success(data, status)
    }

    if(!XHR || !xhrOpen || !xhrSend || !xhrListen){
        invoke(setTimeoutFn, win, ()=>done(true, null, 0), 0)

        return ()=>{}
    }

    let instance = new XHR()

    let loaded = ()=>{
        if(read(instance, xhrReadyState, 'readyState') !== 4) return

        let status = read(instance, xhrStatus, 'status')

        // file:// всегда отдаёт статус 0 при успешной загрузке, как и в jQuery считаем его 200
        if(status === 0) status = 200

        if(status < 200 || status >= 300) return done(true, null, status)

        let text = read(instance, xhrResponse, 'responseText')
        let data = text

        if(params.json !== false){
            try{
                data = invoke(parseJSON, JSON, text)
            }
            catch(e){
                return done(true, null, status)
            }
        }

        done(false, data, status)
    }

    let abort = ()=>{
        if(finished) return

        try{ invoke(xhrAbort, instance) } catch(e){}

        done(true, null, 0)
    }

    timer = invoke(setTimeoutFn, win, abort, timeout)

    try{
        invoke(xhrListen, instance, 'load', loaded, false)
        invoke(xhrListen, instance, 'error', ()=>done(true, null, 0), false)
        invoke(xhrListen, instance, 'abort', ()=>done(true, null, 0), false)
        invoke(xhrOpen, instance, 'GET', url, true)

        if(params.headers && xhrHeader){
            for(let name in params.headers){
                if(has(params.headers, name) && params.headers[name] !== undefined) invoke(xhrHeader, instance, name, params.headers[name] + '')
            }
        }

        invoke(xhrSend, instance, null)
    }
    catch(e){
        done(true, null, 0)
    }

    return abort
}

/**
 * Периодический вызов через захваченный setInterval
 * @param {Function} call
 * @param {Number} ms
 * @returns {Number}
 */
function interval(call, ms){
    return invoke(setIntervalFn, win, ()=>{
        try{
            call()
        }
        catch(e){
            console.error('Ad', 'guard interval error', e)
        }
    }, ms)
}

/**
 * Отложенный вызов через захваченный setTimeout
 * @param {Function} call
 * @param {Number} ms
 * @returns {Number}
 */
function delay(call, ms){
    return invoke(setTimeoutFn, win, call, ms)
}

function clear(id){
    invoke(clearTimeoutFn, win, id)
    invoke(clearIntervalFn, win, id)
}

/**
 * Текущее время через захваченный Date.now
 * @returns {Number}
 */
function time(){
    return invoke(now, Date)
}

/**
 * Создать элемент через нативный createElement
 * @param {String} tag
 * @param {Document} [target] документ, по умолчанию основной
 * @returns {Element}
 */
function element(tag, target){
    return invoke(createElement, target || doc, tag)
}

function append(parent, child){
    return invoke(appendChild, parent, child)
}

function detach(node){
    let parent = read(node, parentNode, 'parentNode')

    if(parent) invoke(removeChild, parent, node)
}

/**
 * Узел находится в основном документе
 * @param {Node} node
 * @returns {Boolean}
 */
function connected(node){
    if(!node) return false

    if(isConnected) return Boolean(invoke(isConnected, node))

    return Boolean(root && invoke(containsNode, root, node))
}

function parent(node){
    return read(node, parentNode, 'parentNode')
}

/**
 * Окно iframe через захваченный геттер contentWindow
 * @param {HTMLIFrameElement} frame
 * @returns {Window|null}
 */
function frame(frameElement){
    return read(frameElement, frameWindow, 'contentWindow')
}

function style(node){
    try{
        return invoke(computedStyle, win, node)
    }
    catch(e){
        return null
    }
}

function rect(node){
    return invoke(boundingRect, node)
}

/**
 * Протокол для запросов к CUB: только http:// или https://, без чтения через Utils/Storage
 * @returns {String}
 */
function protocol(){
    if(location_protocol == 'https:') return 'https://'

    let stored = ''

    try{ stored = win.localStorage.getItem('protocol') || '' }catch(e){}

    return stored.replace(/"/g, '') == 'http' ? 'http://' : 'https://'
}

function viewport(){
    return {
        width: read(win, innerWidthOf, 'innerWidth'),
        height: read(win, innerHeightOf, 'innerHeight')
    }
}

export default {
    has,
    lock,
    request,
    interval,
    delay,
    clear,
    time,
    element,
    append,
    detach,
    connected,
    parent,
    frame,
    style,
    rect,
    viewport,
    protocol,
    root: ()=>root,
    document: ()=>doc
}
