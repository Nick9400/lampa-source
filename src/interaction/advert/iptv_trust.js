// Сессия живого IPTV-плеера. Публичное поле data.iptv её не создаёт:
// его может выставить любой онлайн-плагин и тем самым пропустить рекламу
// в обычном плеере (в том числе на архиве).
let session = null

function grant(data){
    if(data && typeof data == 'object') session = data
}

function revoke(){
    session = null
}

function trusted(data){
    return !!data && data === session
}

export default {
    grant,
    revoke,
    trusted
}
