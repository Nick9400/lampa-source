import Guard from './guard'

/**
 * Изолированный контекст для рекламных SDK.
 *
 * Библиотеки (Google IMA, VASTPlayer) загружаются как текст через нативный
 * XMLHttpRequest и выполняются в отдельном same-origin iframe. Их глобальные
 * объекты никогда не появляются в window основной страницы, поэтому плагин
 * не может заранее подложить поддельный google.ima / VASTPlayer или заморозить
 * его. После загрузки нужные классы забираются в замыкание, а глобальная
 * переменная в iframe удаляется.
 */

let frame    = null
let realm    = null
let tampered = false
let loading  = {}

function create(){
    let iframe = Guard.element('iframe')

    iframe.setAttribute('aria-hidden', 'true')
    iframe.setAttribute('tabindex', '-1')
    iframe.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;border:0;margin:0;padding:0;opacity:0;pointer-events:none;z-index:-1;'

    Guard.append(Guard.root(), iframe)

    let win = Guard.frame(iframe)

    if(!win || typeof win.eval !== 'function') throw new Error('realm unavailable')

    frame = iframe
    realm = win
}

/**
 * Окно изолированного контекста
 * @returns {Window}
 */
function context(){
    if(realm){
        // Удаление iframe извне означает вмешательство: SDK в нём уничтожен
        if(!Guard.connected(frame) || Guard.frame(frame) !== realm){
            tampered = true

            frame = null
            realm = null

            throw tamper('realm removed')
        }

        return realm
    }

    create()

    return realm
}

function tamper(message){
    let error = new Error(message)

    error.tamper = true

    return error
}

/**
 * Загрузить библиотеку в изолированный контекст
 * @param {String} url - адрес библиотеки
 * @param {String} name - имя глобальной переменной, которую создаёт библиотека
 * @param {Object} params {marker: добавить <script src> с типом text/plain (для проверки происхождения внутри SDK)}
 * @returns {Promise} resolve({window, exports})
 */
function load(url, name, params = {}){
    if(loading[url]) return loading[url]

    loading[url] = new Promise((resolve, reject)=>{
        let fail = (error)=>{
            delete loading[url]

            reject(error)
        }

        Guard.request(url, {
            json: false,
            timeout: params.timeout || 20000,
            success: (code)=>{
                let win

                try{
                    win = context()
                }
                catch(e){
                    return fail(e)
                }

                try{
                    if(params.marker){
                        let marker = Guard.element('script', win.document)

                        marker.type = 'text/plain'
                        marker.src  = url

                        Guard.append(win.document.head || win.document.documentElement, marker)
                    }

                    win.eval(code)

                    let exports = win[name]

                    if(!exports) return fail(new Error('library ' + name + ' not found'))

                    try{ delete win[name] } catch(e){}

                    resolve({window: win, exports})
                }
                catch(e){
                    fail(e)
                }
            },
            error: (status)=>{
                // Источник без CORS: подключаем тегом <script>, но всё так же внутри изолированного контекста
                script(url, name, resolve, fail)
            }
        })
    })

    return loading[url]
}

function script(url, name, resolve, fail){
    let win

    try{
        win = context()
    }
    catch(e){
        return fail(e)
    }

    let tag = Guard.element('script', win.document)

    tag.onload = ()=>{
        let exports = win[name]

        if(!exports) return fail(new Error('library ' + name + ' not found'))

        try{ delete win[name] } catch(e){}

        resolve({window: win, exports})
    }

    tag.onerror = ()=>{
        fail(new Error('library load failed'))
    }

    tag.src = url

    Guard.append(win.document.head || win.document.documentElement, tag)
}

export default {
    load,
    context,
    tampered: ()=>tampered
}
