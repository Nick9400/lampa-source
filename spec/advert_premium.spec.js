import {describe, expect, test, beforeEach, vi} from 'vitest'

let responses = {}
let requests  = []
let storage   = {}
let clock     = 1_700_000_000_000

vi.mock('../src/interaction/advert/guard', () => ({
    default: {
        has: (object, key)=>Object.prototype.hasOwnProperty.call(object, key),
        time: ()=>clock,
        protocol: ()=>'https://',
        delay: (call)=>setTimeout(call, 0),
        interval: ()=>0,
        request: (url, params)=>{
            requests.push({url, headers: params.headers})

            let answer = responses[url]

            setTimeout(()=>{
                if(!answer) return params.error(0)

                params.success(answer, 200)
            }, 0)
        }
    }
}))

vi.mock('../src/core/manifest', () => ({
    default: {cub_mirrors_lampa: ['cub.rip', 'durex.monster'], cub_domain: 'evil.example'}
}))

vi.mock('../src/core/storage/storage', () => ({
    default: {get: (name, empty)=>storage[name] !== undefined ? storage[name] : empty}
}))

import Premium from '../src/interaction/advert/premium'

function verify(){
    return new Promise(resolve => Premium.verify(resolve))
}

const days = 20
const premiumUntil = ()=>new Date(clock + days * 24 * 60 * 60 * 1000).toISOString()

beforeEach(()=>{
    responses = {}
    requests  = []
    storage   = {device_name: 'TV'}

    globalThis.window = globalThis.window || {}
    window.lampa_settings = {account_use: true}
})

describe('Ad premium verification', () => {
    test('is not premium until the server confirms it', async () => {
        storage.account = {token: 'real-token', profile: {id: 7}}
        storage.account_user = {id: 1, premium: premiumUntil()}

        // Данные из localStorage не учитываются
        expect(Premium.active()).toBe(false)

        responses['https://cub.rip/api/users/get?device_name=TV'] = {secuses: true, user: {id: 1, premium: premiumUntil()}}

        await verify()

        expect(Premium.settled()).toBe(true)
        expect(Premium.active()).toBe(true)
        expect(Premium.days()).toBe(days)
        expect(requests[0].headers).toEqual({token: 'real-token', profile: 7})
    })

    test('uses only built-in mirrors, never cub_domain from localStorage', async () => {
        storage.account = {token: 'real-token', profile: {id: 7}}

        responses['https://durex.monster/api/users/get?device_name=TV'] = {secuses: true, user: {id: 1, premium: premiumUntil()}}

        await verify()

        expect(requests.map(r=>r.url)).toEqual([
            'https://cub.rip/api/users/get?device_name=TV',
            'https://durex.monster/api/users/get?device_name=TV'
        ])
        expect(Premium.active()).toBe(true)
    })

    test('server says no premium: ads are shown even if localStorage claims otherwise', async () => {
        storage.account = {token: 'real-token', profile: {id: 7}}

        responses['https://cub.rip/api/users/get?device_name=TV'] = {secuses: true, user: {id: 1, premium: '2000-01-01'}}

        await verify()

        expect(Premium.active()).toBe(false)
    })

    test('without a token settles immediately as not premium', async () => {
        storage.account = {}

        await verify()

        expect(requests.length).toBe(0)
        expect(Premium.settled()).toBe(true)
        expect(Premium.active()).toBe(false)
    })

    test('account change resets verified premium until re-confirmed', async () => {
        storage.account = {token: 'real-token', profile: {id: 7}}
        responses['https://cub.rip/api/users/get?device_name=TV'] = {secuses: true, user: {id: 1, premium: premiumUntil()}}

        await verify()

        expect(Premium.active()).toBe(true)

        // Плагин подменил аккаунт на другой токен
        storage.account = {token: 'other-token', profile: {id: 1}}
        responses = {}

        Premium.refresh()

        expect(Premium.active()).toBe(false)

        await new Promise(r => setTimeout(r, 5))

        expect(Premium.active()).toBe(false)
    })
})
