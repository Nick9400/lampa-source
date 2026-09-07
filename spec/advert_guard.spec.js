import {describe, expect, test, beforeAll, afterEach, vi} from 'vitest'

/**
 * Эмуляция нативного XMLHttpRequest: ответы берутся из FakeXHR.responses,
 * события load/error доставляются асинхронно через addEventListener
 */
class FakeXHR {
    constructor(){
        this._listeners = {}
        this._status = 0
        this._readyState = 0
        this._response = ''
    }

    open(method, url){
        this._url = url
        this._readyState = 1
    }

    send(){
        setTimeout(()=>{
            let answer = FakeXHR.responses[this._url]

            this._readyState = 4

            if(!answer) return this._emit('error')

            this._status   = answer.status
            this._response = answer.body

            this._emit('load')
        }, 0)
    }

    abort(){
        this._emit('abort')
    }

    addEventListener(type, call){
        (this._listeners[type] = this._listeners[type] || []).push(call)
    }

    _emit(type){
        (this._listeners[type] || []).forEach(call => Reflect.apply(call, this, [{}]))
    }

    get status(){ return this._status }
    get readyState(){ return this._readyState }
    get responseText(){ return this._response }
}

FakeXHR.responses = {}

let Guard

function request(url, params = {}){
    return new Promise(resolve => {
        Guard.request(url, Object.assign({
            success: (data, status)=>resolve({ok: true, data, status}),
            error: (status)=>resolve({ok: false, status})
        }, params))
    })
}

beforeAll(async ()=>{
    globalThis.XMLHttpRequest = FakeXHR

    vi.resetModules()

    Guard = (await import('../src/interaction/advert/guard')).default
})

afterEach(()=>{
    FakeXHR.responses = {}
})

describe('Ad guard request', () => {
    test('loads JSON through the native transport', async () => {
        FakeXHR.responses['https://cub.rip/api/ad/get/banner'] = {status: 200, body: '{"ad":[{"name":"real"}]}'}

        let result = await request('https://cub.rip/api/ad/get/banner')

        expect(result.ok).toBe(true)
        expect(result.data.ad[0].name).toBe('real')
    })

    test('ignores XMLHttpRequest replaced or patched after startup', async () => {
        FakeXHR.responses['https://cub.rip/api/ad/get/banner'] = {status: 200, body: '{"ad":[{"name":"real"}]}'}

        let original = {
            ctor: globalThis.XMLHttpRequest,
            open: FakeXHR.prototype.open,
            send: FakeXHR.prototype.send,
            listen: FakeXHR.prototype.addEventListener,
            response: Object.getOwnPropertyDescriptor(FakeXHR.prototype, 'responseText'),
            parse: JSON.parse
        }

        let restore = ()=>{
            globalThis.XMLHttpRequest = original.ctor
            FakeXHR.prototype.open = original.open
            FakeXHR.prototype.send = original.send
            FakeXHR.prototype.addEventListener = original.listen
            Object.defineProperty(FakeXHR.prototype, 'responseText', original.response)
            JSON.parse = original.parse
        }

        // Плагин: подменяет конструктор, методы прототипа, геттер ответа и JSON.parse
        globalThis.XMLHttpRequest = class Blocked {
            open(){}
            send(){}
            abort(){}
            addEventListener(type, call){ if(type == 'load') setTimeout(()=>Reflect.apply(call, this, [{}]), 0) }
            get status(){ return 200 }
            get readyState(){ return 4 }
            get responseText(){ return '{"ad":[]}' }
        }

        FakeXHR.prototype.open = function(){ this._url = 'blocked' }
        FakeXHR.prototype.send = function(){ this._readyState = 4; this._status = 200; this._response = '{"ad":[]}'; this._emit('load') }
        FakeXHR.prototype.addEventListener = function(){}

        Object.defineProperty(FakeXHR.prototype, 'responseText', {get(){ return '{"ad":[]}' }, configurable: true})

        JSON.parse = ()=>({ad: []})

        let result = await new Promise(resolve => {
            Guard.request('https://cub.rip/api/ad/get/banner', {
                success: (data)=>{ restore(); resolve({ok: true, data}) },
                error: (status)=>{ restore(); resolve({ok: false, status}) }
            })
        })

        expect(result.ok).toBe(true)
        expect(result.data.ad).toEqual([{name: 'real'}])
    })

    test('reports failures and invalid payloads as errors', async () => {
        FakeXHR.responses['https://cub.rip/404'] = {status: 404, body: ''}
        FakeXHR.responses['https://cub.rip/broken'] = {status: 200, body: 'not json'}

        expect((await request('https://cub.rip/404')).ok).toBe(false)
        expect((await request('https://cub.rip/broken')).ok).toBe(false)
        expect((await request('https://cub.rip/offline')).ok).toBe(false)
    })

    test('returns raw text when json is disabled and treats status 0 as a local success', async () => {
        FakeXHR.responses['./personal.lampa'] = {status: 0, body: 'ok'}

        let result = await request('./personal.lampa', {json: false})

        expect(result.ok).toBe(true)
        expect(result.data).toBe('ok')
    })

    test('aborts on timeout', async () => {
        let slow = FakeXHR.prototype.send

        FakeXHR.prototype.send = function(){}

        try{
            let result = await request('https://cub.rip/slow', {timeout: 20})

            expect(result.ok).toBe(false)
        }
        finally{
            FakeXHR.prototype.send = slow
        }
    })
})

describe('Ad guard helpers', () => {
    test('has() ignores getters injected into Object.prototype', () => {
        Object.defineProperty(Object.prototype, 'iptv', {get(){ return true }, configurable: true})

        try{
            expect(Guard.has({}, 'iptv')).toBe(false)
            expect(Guard.has({iptv: false}, 'iptv')).toBe(true)
            expect(Guard.has(null, 'iptv')).toBe(false)
        }
        finally{
            delete Object.prototype.iptv
        }
    })

    test('lock() prevents overriding and deleting methods', () => {
        let play = ()=>'original'
        let object = {play, other: 1}

        Guard.lock(object, ['play', 'missing'])

        expect(()=>{ 'use strict'; object.play = ()=>'hijacked' }).toThrow()
        expect(()=>{ 'use strict'; delete object.play }).toThrow()
        expect(()=>{ Object.defineProperty(object, 'play', {value: 1}) }).toThrow()

        expect(object.play).toBe(play)

        object.other = 2

        expect(object.other).toBe(2)
    })

    test('interval() and delay() use the captured timers', async () => {
        let native = globalThis.setTimeout

        globalThis.setTimeout = ()=>{ throw new Error('timer hijacked') }

        try{
            await new Promise(resolve => Guard.delay(resolve, 1))
        }
        finally{
            globalThis.setTimeout = native
        }
    })
})
