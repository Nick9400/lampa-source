const CUB_HOSTS = ['cub.best', 'cub.black', 'durex.monster', 'cubnotrip.top']
const NativeError = Error

let live = null
let catchup = new WeakMap()
let continued = new WeakMap()

function markLive(data){
    live = data || null
}

function markCatchup(data){
    if(data && typeof data.url == 'string' && data.url) catchup.set(data, data.url)
}

function markContinue(data){
    if(data && typeof data.url == 'string' && data.url) continued.set(data, data.url)
}

// Метки iptv, tv, need_check_live_stream и continue_play сами по себе не читаются.
function isTrustedIptv(data){
    if(!data) return false
    if(data === live) return true
    if(catchup.get(data) === data.url) return true
    if(continued.get(data) === data.url) return true

    return false
}

function scriptIsIptvPlugin(file, pageHref){
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

function stackHasIptvPlugin(files, pageHref){
    if(!files || !files.length) return false

    for(let i = 0; i < files.length; i++){
        if(scriptIsIptvPlugin(files[i], pageHref)) return true
    }

    return false
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

function calledFromIptvPlugin(){
    let page = ''

    try{
        page = window.location.href
    }
    catch(e){}

    return stackHasIptvPlugin(stackFiles(), page)
}

export default {
    markLive,
    markCatchup,
    markContinue,
    isTrustedIptv,
    scriptIsIptvPlugin,
    stackHasIptvPlugin,
    stackFiles,
    calledFromIptvPlugin
}
