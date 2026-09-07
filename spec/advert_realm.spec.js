import {describe, expect, test, beforeEach, vi} from 'vitest'

let responses = {}
let frames    = []

/**
 * Эмуляция iframe: своё окно с eval и документом
 */
function makeFrame(){
    let win = {
        document: {
            head: {children: []},
            createElement: (tag)=>({tag})
        }
    }

    win.eval = (code)=>{
        // выполняем код так, чтобы `window` внутри указывал на окно iframe
        new Function('window', code)(win)
    }

    let frame = {tag: 'iframe', style: {}, connected: true, window: win, setAttribute(){}}

    frames.push(frame)

    return frame
}

vi.mock('../src/interaction/advert/guard', () => ({
    default: {
        element: (tag, doc)=>tag == 'iframe' ? makeFrame() : doc ? doc.createElement(tag) : {tag},
        append: (parent, child)=>{ if(parent && parent.children) parent.children.push(child) },
        root: ()=>({children: []}),
        frame: (frame)=>frame.window,
        connected: (frame)=>frame.connected,
        request: (url, params)=>{
            setTimeout(()=>{
                let answer = responses[url]

                answer ? params.success(answer, 200) : params.error(0)
            }, 0)
        }
    }
}))

let Realm

beforeEach(async ()=>{
    responses = {}
    frames    = []

    vi.resetModules()

    Realm = (await import('../src/interaction/advert/realm')).default
})

describe('Ad SDK realm', () => {
    test('evaluates the library in the iframe and hides its global afterwards', async () => {
        responses['https://sdk.example/ima3.js'] = 'window.google = {ima: {VERSION: "3.x"}}'

        // Плагин заранее подложил и заморозил поддельный SDK в основном окне
        globalThis.google = Object.freeze({ima: Object.freeze({fake: true})})

        try{
            let lib = await Realm.load('https://sdk.example/ima3.js', 'google', {marker: true})

            expect(lib.exports.ima.VERSION).toBe('3.x')
            expect(lib.exports.ima.fake).toBeUndefined()

            // после захвата глобальная переменная внутри iframe удалена
            expect(lib.window.google).toBeUndefined()

            // маркер происхождения для проверки внутри SDK добавлен в документ iframe
            expect(lib.window.document.head.children[0]).toMatchObject({type: 'text/plain', src: 'https://sdk.example/ima3.js'})

            // основное окно не тронуто
            expect(globalThis.google.ima.fake).toBe(true)
        }
        finally{
            delete globalThis.google
        }
    })

    test('reuses one realm and one load per url', async () => {
        responses['https://sdk.example/a.js'] = 'window.A = 1'
        responses['https://sdk.example/b.js'] = 'window.B = 2'

        let [a1, a2, b] = await Promise.all([
            Realm.load('https://sdk.example/a.js', 'A'),
            Realm.load('https://sdk.example/a.js', 'A'),
            Realm.load('https://sdk.example/b.js', 'B')
        ])

        expect(a1).toBe(a2)
        expect(a1.window).toBe(b.window)
        expect(frames.length).toBe(1)
    })

    test('a removed realm iframe is reported as tampering', async () => {
        responses['https://sdk.example/a.js'] = 'window.A = 1'

        await Realm.load('https://sdk.example/a.js', 'A')

        frames[0].connected = false

        expect(()=>Realm.context()).toThrowError(expect.objectContaining({tamper: true}))
        expect(Realm.tampered()).toBe(true)
    })

    test('a missing library export rejects', async () => {
        responses['https://sdk.example/empty.js'] = '1'

        await expect(Realm.load('https://sdk.example/empty.js', 'Nothing')).rejects.toThrow(/not found/)
    })
})
