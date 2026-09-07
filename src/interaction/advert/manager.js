import Premiere from './premiere'
import Extend from './extend'
import Preroll from './preroll'
import Banner from './banner'
import Platform from '../../core/platform'
import Guard from './guard'
import Premium from './premium'

/**
 * Закрепить точки входа, через которые плагины могли бы подменить плеер
 * и обойти рекламу. Вызывается сразу после создания window.Lampa, до загрузки плагинов
 */
function protect(){
    Guard.lock(window, ['Lampa'])
    Guard.lock(window.Lampa, ['Player'])
}

function init(){
    Premiere.init()
    Extend.init()
    
    if(!Platform.is(['orsay', 'netcast'])){
        Premium.init()
        Preroll.init()
        Banner.init()
    }
}

export default {
    protect,
    init
}
