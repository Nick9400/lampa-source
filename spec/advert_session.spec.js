import {describe, expect, test, beforeEach, vi} from 'vitest'

vi.mock('../src/interaction/torserver', () => ({
    default: {ip: () => '192.168.1.10:8090'}
}))

vi.mock('../src/interaction/activity/activity', () => ({
    default: {active: () => ({component: 'full'})}
}))

import Session from '../src/interaction/advert/session'

beforeEach(()=>{
    Session.destroy()
})

describe('Ad session snapshot', () => {
    test('ignores flags injected by create handlers and keeps plugin VAST', () => {
        let data = {url: 'https://cdn.example/video.mp4', title: 'Movie', vast_url: 'https://ads.example/vast.xml', vast_msg: 'Sponsor'}

        Session.capture(data)

        // Блокировщик в обработчике 'create': помечает как iptv и убирает рекламу плагина
        data.iptv = true
        delete data.vast_url
        delete data.vast_msg

        let session = Session.resolve(data)

        expect(session.iptv).toBe(false)
        expect(session.any).toBe(false)
        expect(session.vast.vast_url).toBe('https://ads.example/vast.xml')
        expect(session.vast.vast_msg).toBe('Sponsor')
    })

    test('respects iptv set before play() is called', () => {
        let data = {url: 'https://tv.example/stream.m3u8', iptv: true}

        Session.capture(data)

        expect(Session.resolve(data).any).toBe(true)
    })

    test('resolve() without a prior capture snapshots the data as is', () => {
        let session = Session.resolve({url: 'https://tv.example/stream.m3u8', iptv: true})

        expect(session.iptv).toBe(true)
    })

    test('ignores iptv getters injected into Object.prototype', () => {
        Object.defineProperty(Object.prototype, 'iptv', {get(){ return true }, configurable: true})

        try{
            let data = {url: 'https://cdn.example/video.mp4'}

            Session.capture(data)

            expect(Session.resolve(data).iptv).toBe(false)
        }
        finally{
            delete Object.prototype.iptv
        }
    })

    test('allows plugins to add their own VAST during create', () => {
        let data = {url: 'https://cdn.example/video.mp4'}

        Session.capture(data)

        data.vast_url = 'https://ads.example/plugin.xml'

        expect(Session.resolve(data).vast.vast_url).toBe('https://ads.example/plugin.xml')
    })

    test('detects torrents only when the stream comes from torrserver', () => {
        let torrent = {url: 'http://192.168.1.10:8090/stream/file.mkv', torrent_hash: 'abc'}
        let fake    = {url: 'https://cdn.example/video.mp4', torrent_hash: 'abc'}

        expect(Session.capture(torrent).torrent).toBe(true)
        expect(Session.capture(fake).torrent).toBe(false)
    })

    test('detects youtube trailers', () => {
        let trailer = {url: 'https://www.youtube.com/watch?v=1', youtube: true}

        expect(Session.capture(trailer).youtube).toBe(true)
        expect(Session.capture({url: 'https://cdn.example/video.mp4', youtube: true}).youtube).toBe(false)
        expect(Session.capture({url: 'https://www.youtube.com/watch?v=1'}).youtube).toBe(false)
    })

    test('treats continue_play as continuation only after the player selected the item', () => {
        let next = {url: 'https://cdn.example/e2.mp4', continue_play: true}
        let cold = {url: 'https://cdn.example/e2.mp4', continue_play: true}

        Session.next(next)

        expect(Session.capture(next).continue).toBe(true)
        expect(Session.capture(cold).continue).toBe(false)
        expect(Session.capture(next).continue).toBe(false)
    })
})

describe('Ad session playback state', () => {
    test('exposes the playing snapshot between ready() and destroy()', () => {
        let data = {url: 'https://cdn.example/video.mp4'}
        let events = []

        Session.listener.follow('ready', ()=>events.push('ready'))
        Session.listener.follow('destroy', ()=>events.push('destroy'))

        expect(Session.playing()).toBe(null)

        Session.capture(data)
        Session.resolve(data)

        data.iptv = true

        Session.ready(data)

        expect(Session.playing().data).toBe(data)
        expect(Session.playing().iptv).toBe(false)

        Session.destroy()

        expect(Session.playing()).toBe(null)
        expect(events).toEqual(['ready', 'destroy'])
    })

    test('ready() for data that skipped the preroll snapshots it directly', () => {
        let data = {url: 'https://tv.example/stream.m3u8', iptv: true}

        Session.ready(data)

        expect(Session.playing().iptv).toBe(true)
    })
})
