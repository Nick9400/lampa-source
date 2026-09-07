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
 * @param {Object|Boolean} params {deep: проверять предков до <html>, occlusion: проверять перекрытие сверху}. Булево значение трактуется как deep
 * @returns {String|null}
 */
function inspect(elem, params){
    if(typeof params !== 'object' || params === null) params = {deep: Boolean(params)}

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

            // filter/clip-path/transform к нашим рекламным узлам не применяются — любое такое
            // значение это попытка скрыть элемент в обход проверок display/visibility/opacity.
            // Проверяем только сам элемент: у предков это может быть штатная анимация приложения
            if(node === elem){
                if(css.filter && css.filter != 'none') return 'filter'
                if(hidingClip(css.clipPath || css.webkitClipPath)) return 'clip'
                if(css.transform && css.transform != 'none' && css.transform != 'matrix(1, 0, 0, 1, 0, 0)') return 'transform'
                if(css.mixBlendMode && css.mixBlendMode != 'normal') return 'blend'
            }
        }

        if(!params.deep) break

        node = Guard.parent(node)
    }

    let rect = Guard.rect(elem)
    let view = Guard.viewport()

    if(rect.width < 2 || rect.height < 2) return 'size'

    if(rect.right <= 0 || rect.bottom <= 0 || rect.left >= view.width || rect.top >= view.height) return 'offscreen'

    if(params.occlusion && covered(elem, rect, view)) return 'covered'

    return null
}

/**
 * clip-path, отсекающий весь элемент (inset(100%), нулевой круг и т.п.)
 */
function hidingClip(clip){
    if(!clip || clip == 'none') return false

    if(/inset\(\s*(100|9\d(\.\d+)?)%/.test(clip)) return true
    if(/circle\(\s*0(px|%)?\s*(at|\))/.test(clip)) return true
    if(/polygon\([^)]*\)/.test(clip) && !/[1-9]/.test(clip.replace(/0%/g, ''))) return true

    return false
}

/**
 * Элемент перекрыт сверху посторонним узлом: ни одна из контрольных точек внутри
 * него не принадлежит ему самому или его потомкам (в т.ч. iframe рекламы)
 */
function covered(elem, rect, view){
    if(!Guard.topElement) return false

    let clamp = (v, max)=> v < 1 ? 1 : v > max - 1 ? max - 1 : v

    let cx = clamp(rect.left + rect.width / 2, view.width)
    let cy = clamp(rect.top + rect.height / 2, view.height)

    let points = [
        [cx, cy],
        [clamp(rect.left + rect.width * 0.25, view.width), clamp(rect.top + rect.height * 0.25, view.height)],
        [clamp(rect.left + rect.width * 0.75, view.width), clamp(rect.top + rect.height * 0.25, view.height)],
        [clamp(rect.left + rect.width * 0.25, view.width), clamp(rect.top + rect.height * 0.75, view.height)],
        [clamp(rect.left + rect.width * 0.75, view.width), clamp(rect.top + rect.height * 0.75, view.height)]
    ]

    let hit = false

    for(let i = 0; i < points.length; i++){
        let top = Guard.topElement(points[i][0], points[i][1])

        // потомок рекламного элемента (видео, iframe SDK, кнопка пропуска) — значит точка не перекрыта
        if(top && Guard.contains(elem, top)){
            hit = true

            break
        }
    }

    return !hit
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

        let reason = inspect(elem, params)

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
