import {describe, expect, test} from 'vitest'
import IptvTrust from '../src/interaction/advert/iptv_trust'

let page = 'http://localhost/'
let official = [
    'http://localhost/plugins/iptv/iptv.js',
    'https://cub.best/plugin/iptv',
    'file:///android_asset/plugins/iptv/channels/main.js'
]

describe('IPTV archive ads', () => {
    test('a public iptv flag does not skip ads', () => {
        let movie = {
            url: 'http://example/movie.mp4',
            iptv: true,
            need_check_live_stream: true
        }

        expect(IptvTrust.archiveSkipsAds(movie, 'online', official, page)).toBe(false)
        expect(IptvTrust.archiveSkipsAds(movie, 'iptv', ['https://evil.example/plugin.js'], page)).toBe(false)
        expect(IptvTrust.trusted(movie)).toBe(false)
    })

    test('builtin archive playback skips ads like a torrent', () => {
        let archive = {
            url: 'http://example/archive.m3u8',
            need_check_live_stream: true,
            iptv: true
        }

        expect(IptvTrust.archiveSkipsAds(archive, 'iptv', official, page)).toBe(true)
        expect(IptvTrust.archiveSkipsAds(archive, 'main', official, page)).toBe(false)
        expect(IptvTrust.archiveSkipsAds({url: archive.url}, 'iptv', official, page)).toBe(false)
    })

    test('a copy of the iptv plugin hosted elsewhere is not official', () => {
        expect(IptvTrust.isOfficialIptvScript('https://evil.example/plugin/iptv', page)).toBe(false)
        expect(IptvTrust.isOfficialIptvScript('https://evil.example/plugins/iptv/iptv.js', page)).toBe(false)
        expect(IptvTrust.isOfficialIptvScript('https://cub.black/plugin/iptv.js', page)).toBe(true)
    })

    test('archive trust is the original object and url', () => {
        let archive = {url: 'http://example/archive.m3u8', need_check_live_stream: true}
        let copy = {url: archive.url, iptv: true}

        IptvTrust.grantArchive(archive)

        expect(IptvTrust.trusted(archive)).toBe(true)
        expect(IptvTrust.trusted(copy)).toBe(false)

        archive.url = 'http://example/movie.mp4'

        expect(IptvTrust.trusted(archive)).toBe(false)
    })

    test('live IPTV trust does not survive a regular playback reset', () => {
        let live = {url: 'http://example/live.m3u8', iptv: true}

        IptvTrust.grantLive(live)

        expect(IptvTrust.trusted(live)).toBe(true)

        IptvTrust.revokeLive()

        expect(IptvTrust.trusted(live)).toBe(false)
    })
})
