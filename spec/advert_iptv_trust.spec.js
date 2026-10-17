import {describe, expect, test} from 'vitest'
import IptvTrust from '../src/interaction/advert/iptv_trust'

describe('IPTV ad exemption', () => {
    test('public iptv flag does not skip ads in the regular player', () => {
        IptvTrust.revoke()

        let archive = {url: 'http://example/archive.m3u8', iptv: true}

        expect(IptvTrust.trusted(archive)).toBe(false)
    })

    test('only the internal IPTV player session is trusted', () => {
        IptvTrust.revoke()

        let live = {url: 'http://example/live.m3u8'}
        let copy = {url: live.url, iptv: true}

        IptvTrust.grant(live)

        expect(IptvTrust.trusted(live)).toBe(true)
        expect(IptvTrust.trusted(copy)).toBe(false)
    })

    test('a later regular playback drops the IPTV session', () => {
        let live = {url: 'http://example/live.m3u8', iptv: true}

        IptvTrust.grant(live)
        IptvTrust.revoke()

        expect(IptvTrust.trusted(live)).toBe(false)
    })
})
