import Guard from './guard'

/**
 * Контроль целостности рекламных элементов.
 *
 * Пока идёт реклама, проверяет через захваченные нативные API, что элемент
 * остаётся в документе, не скрыт стилями (display/visibility/opacity) и
 * находится в пределах экрана. Любое из этих состояний во время показа
 * не возникает само по себе, поэтому трактуется как внешнее вмешательство.
 */

const TICK = 500

/**
 * Причина, по которой элемент нельзя считать видимым, либо null
 * @param {Element} elem
 * @param {Boolean} deep - проверять также всех предков до <html>
 * @returns {String|null}
 */
function inspect(elem, deep){
    if(!elem) return 'missing'

    if(!Guard.connected(elem)) return 'removed'

    let node = elem
    let root = Guard.root()

    while(node && node !== root && node.nodeType === 1){
        let css = Guard.style(node)

        if(css){
            if(css.display == 'none') return 'display'
            if(css.visibility == 'hidden' || css.visibility == 'collapse') return 'visibility'
            if(parseFloat(css.opacity) < 0.1) return 'opacity'
        }

        if(!deep) break

        node = Guard.parent(node)
    }

    let rect = Guard.rect(elem)
    let view = Guard.viewport()

    if(rect.width < 2 || rect.height < 2) return 'size'

    if(rect.right <= 0 || rect.bottom <= 0 || rect.left >= view.width || rect.top >= view.height) return 'offscreen'

    return null
}

/**
 * Следить за элементом
 * @param {Element} elem
 * @param {Object} params {deep: Boolean, skip: Function -> Boolean (пропустить проверку на этом тике), onTamper: Function(reason)}
 * @returns {Function} остановить наблюдение
 */
function start(elem, params = {}){
    let stopped = false
    let timer   = null

    let stop = ()=>{
        stopped = true

        if(timer !== null){
            Guard.clear(timer)

            timer = null
        }
    }

    timer = Guard.interval(()=>{
        if(stopped) return

        if(params.skip && params.skip()) return

        let reason = inspect(elem, params.deep)

        if(reason){
            stop()

            console.log('Ad', 'integrity violated:', reason)

            if(params.onTamper) params.onTamper(reason)
        }
    }, params.tick || TICK)

    return stop
}

export default {
    inspect,
    start
}
