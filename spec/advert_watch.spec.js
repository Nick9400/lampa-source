import {describe, expect, test, beforeEach, vi} from 'vitest'

const root = {nodeType: 1, name: 'html'}

let timers = []

/**
 * Минимальный DOM: узел с вычисленным стилем, размером и родителем
 */
function node(name, css = {}, parent = root, rect = {left: 0, top: 0, right: 1280, bottom: 720, width: 1280, height: 720}){
    return {
        nodeType: 1,
        name,
        parent,
        connected: true,
        css: Object.assign({display: 'block', visibility: 'visible', opacity: '1'}, css),
        rect
    }
}

vi.mock('../src/interaction/advert/guard', () => ({
    default: {
        root: ()=>root,
        connected: (elem)=>elem.connected,
        style: (elem)=>elem.css,
        parent: (elem)=>elem.parent,
        rect: (elem)=>elem.rect,
        viewport: ()=>({width: 1280, height: 720}),
        interval: (call)=>{ timers.push(call); return timers.length },
        clear: (id)=>{ timers[id - 1] = null }
    }
}))

import Watch from '../src/interaction/advert/watch'

function tick(){
    timers.forEach(call => call && call())
}

beforeEach(()=>{
    timers = []
})

describe('Ad integrity watchdog', () => {
    test('a visible element passes', () => {
        expect(Watch.inspect(node('ad'), true)).toBe(null)
    })

    test('detects removal and hiding of the element itself', () => {
        let removed = node('ad')
            removed.connected = false

        expect(Watch.inspect(removed, false)).toBe('removed')
        expect(Watch.inspect(node('ad', {display: 'none'}), false)).toBe('display')
        expect(Watch.inspect(node('ad', {visibility: 'hidden'}), false)).toBe('visibility')
        expect(Watch.inspect(node('ad', {opacity: '0'}), false)).toBe('opacity')
        expect(Watch.inspect(node('ad', {}, root, {left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0}), false)).toBe('size')
        expect(Watch.inspect(node('ad', {}, root, {left: -2000, top: 0, right: -720, bottom: 720, width: 1280, height: 720}), false)).toBe('offscreen')
    })

    test('deep mode catches hiding through an ancestor', () => {
        let body = node('body', {display: 'none'})
        let ad   = node('ad', {}, body)

        expect(Watch.inspect(ad, false)).toBe(null)
        expect(Watch.inspect(ad, true)).toBe('display')
    })

    test('start() reports the first violation once and stops', () => {
        let ad = node('ad')
        let reasons = []

        let stop = Watch.start(ad, {deep: true, onTamper: (reason)=>reasons.push(reason)})

        tick()
        expect(reasons).toEqual([])

        ad.css.display = 'none'

        tick()
        tick()

        expect(reasons).toEqual(['display'])
        expect(timers.filter(Boolean).length).toBe(0)

        stop()
    })

    test('skip() suspends checks while the host itself is legitimately hidden', () => {
        let ad = node('ad')
        let hidden = true
        let reasons = []

        Watch.start(ad, {skip: ()=>hidden, onTamper: (reason)=>reasons.push(reason)})

        ad.connected = false

        tick()
        expect(reasons).toEqual([])

        hidden = false

        tick()
        expect(reasons).toEqual(['removed'])
    })
})
