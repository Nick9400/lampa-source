// Встроенные зеркала CUB. Пользовательский список из localStorage сюда не входит:
// онлайн-плагин может дописать туда свой домен.
const CUB_HOSTS = ['cub.best', 'cub.black', 'durex.monster', 'cubnotrip.top']

const NativeError = Error

let live = null
let archiveUrls = new WeakMap()

function grantLive(data){
    if(data && typeof data == 'object') live = data
}

function revokeLive(){
    live = null
}

function grantArchive(data){
    if(!data || typeof data.url != 'string' || !data.url) return

    archiveUrls.set(data, data.url)
}

function trusted(data){
    if(!data) return false

    if(data === live) return true

    return archiveUrls.get(data) === data.url
}

function isOfficialIptvScript(file, pageHref){
    if(!file || typeof file != 'string') return false

    let url

    try{
        url = new URL(file, pageHref || 'http://localhost/')
    }
    catch(e){
        return false
    }

    let path = url.pathname || ''
    let host = (url.hostname || '').toLowerCase()

    if(CUB_HOSTS.indexOf(host) >= 0 && /^\/plugin\/iptv(?:\.js)?$/.test(path)) return true

    if(!/\/plugins\/iptv\/.+\.js$/.test(path)) return false

    if(url.protocol == 'file:') return true

    if(!pageHref) return false

    try{
        return url.origin == new URL(pageHref).origin
    }
    catch(e){
        return false
    }
}

function stackFiles(){
    let files = []
    let previous = NativeError.prepareStackTrace

    try{
        NativeError.prepareStackTrace = function(error, stack){ return stack }

        let sites = new NativeError().stack

        if(Array.isArray(sites)){
            for(let i = 0; i < sites.length; i++){
                let file = sites[i] && sites[i].getFileName && sites[i].getFileName()

                if(file) files.push(file)
            }
        }
    }
    catch(e){}

    NativeError.prepareStackTrace = previous

    if(files.length) return files

    let text = ''

    try{
        text = new NativeError().stack || ''
    }
    catch(e){}

    return text.match(/https?:\/\/[^\s)]+|file:\/\/[^\s)]+/g) || []
}

// Архив в обычном плеере: экран IPTV, пометка живого потока и вызов из
// файла встроенного плагина. Поле iptv само по себе рекламу не отключает.
function archiveSkipsAds(data, component, files, pageHref){
    if(!data || data.need_check_live_stream !== true) return false
    if(component != 'iptv') return false
    if(!files || !files.length) return false

    for(let i = 0; i < files.length; i++){
        if(isOfficialIptvScript(files[i], pageHref)) return true
    }

    return false
}

export default {
    grantLive,
    revokeLive,
    grantArchive,
    trusted,
    isOfficialIptvScript,
    stackFiles,
    archiveSkipsAds
}
