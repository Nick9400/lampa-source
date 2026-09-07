import Guard from '../interaction/advert/guard'

let status = false

/**
 * Наличие файла ./personal.lampa отключает рекламу для своей сборки.
 * Проверка идёт через нативный XMLHttpRequest, чтобы плагины не могли
 * подменить ответ через $.ajaxTransport и выдать себя за personal сборку
 */
function init(){
    Guard.request('./personal.lampa', {
        json: false,
        success: ()=>{
            status = true
        }
    })
}

function confirm(){
    return status
}

export default {
    init,
    confirm
}
