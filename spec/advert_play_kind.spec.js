import {describe, expect, test} from 'vitest'
import PlayKind from '../src/interaction/advert/play_kind'

let page = 'http://lampa.local/'
let iptvCall = [
    page + 'app.js',
    page + 'plugins/iptv/channels/main.js'
]
let cubCall = ['https://cub.best/plugin/iptv']
let onlineCall = ['https://cdn.example/online.js']

function allows(data, files){
    PlayKind.markLive(null)

    if(PlayKind.stackHasIptvPlugin(files, page) && data && data.need_check_live_stream === true){
        PlayKind.markCatchup(data)
    }

    return PlayKind.isTrustedIptv(data)
}

describe('Player ad marks', () => {
    test('online balancers cannot skip ads with iptv, tv or live-stream marks', () => {
        let rezka = {
            url: 'http://cdn/movie.m3u8',
            timeline: {time: 10},
            quality: {1080: 'http://cdn/movie.m3u8'},
            title: 'Film',
            iptv: true,
            tv: true,
            need_check_live_stream: true,
            continue_play: true
        }
        let collaps = {
            url: 'http://cdn/episode.mp4',
            timeline: {time: 0},
            title: 'Episode',
            subtitles: [],
            iptv: true,
            need_check_live_stream: true
        }

        expect(allows(rezka, onlineCall)).toBe(false)
        expect(allows(collaps, onlineCall)).toBe(false)
        expect(PlayKind.isTrustedIptv({url: 'http://cdn/movie.m3u8', iptv: true})).toBe(false)
    })

    test('archive from the iptv plugin skips ads on any screen name', () => {
        let archive = (url)=>({
            title: '12:00 - News',
            url,
            need_check_live_stream: true
        })

        expect(allows(archive('http://list.tv/a.m3u8'), iptvCall)).toBe(true)
        expect(allows(archive('http://list.tv/b.m3u8'), cubCall)).toBe(true)
        expect(allows(archive('http://list.tv/c.m3u8'), onlineCall)).toBe(false)
    })

    test('iptv history on the main screen is not archive', () => {
        let channel = {title: 'News', url: 'http://list.tv/live', tv: true}

        expect(allows(channel, iptvCall)).toBe(false)
    })

    test('a foreign copy of the iptv path is not the built-in plugin', () => {
        expect(PlayKind.scriptIsIptvPlugin('https://evil.example/plugins/iptv/iptv.js', page)).toBe(false)
        expect(PlayKind.scriptIsIptvPlugin('https://evil.example/plugin/iptv', page)).toBe(false)
        expect(PlayKind.scriptIsIptvPlugin('https://cub.black/plugin/online', page)).toBe(false)
    })

    test('changing the url drops a granted archive object', () => {
        let archive = {url: 'http://list.tv/archive.m3u8', need_check_live_stream: true}

        PlayKind.markCatchup(archive)

        expect(PlayKind.isTrustedIptv(archive)).toBe(true)

        archive.url = 'http://cdn/movie.m3u8'

        expect(PlayKind.isTrustedIptv(archive)).toBe(false)
    })

    test('continue_play skips ads only after the player itself advances the playlist', () => {
        let episode = {url: 'http://cdn/e2.mp4', title: 'Episode 2', continue_play: true}

        expect(PlayKind.isTrustedIptv(episode)).toBe(false)

        PlayKind.markContinue(episode)

        expect(PlayKind.isTrustedIptv(episode)).toBe(true)
    })
})
