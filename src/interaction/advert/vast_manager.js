import Utils from '../../utils/utils'
import Manifest from '../../core/manifest'
import Storage from '../../core/storage/storage'
import Platform from '../../core/platform'
import Arrays from '../../utils/arrays'
import VPN from '../../core/vpn'
import Guard from './guard'

class VastManager {
    constructor(params){
        this.played = {
            time: 0,
            prerolls: []
        }

        this.data_loaded = {
            ad: []
        }

        Arrays.extend(params, {
            api: 'preroll',
            cooling: 1000 * 60 * 5
        })

        this.params = params
    }

    init(){
        this.load()

        Guard.interval(this.load.bind(this), 1000 * 60 * 60)
    }

    /**
     * Загрузка списка рекламы идёт через нативный XMLHttpRequest (Guard.request),
     * чтобы плагины не могли подменить ответ через $.ajaxTransport / $.ajaxPrefilter
     * или обёртку над XMLHttpRequest
     */
    load(){
        let pos = 0

        let request = ()=>{
            let domain = Manifest.cub_mirrors[pos]

            if(domain){
                Guard.request(Utils.protocol() + domain + '/api/ad/get/' + this.params.api, {
                    timeout: 10000,
                    success: (data)=>{
                        if(data && data.ad && Arrays.isArray(data.ad)){
                            this.data_loaded.ad = data.ad

                            console.log('Ad', 'manager ' + this.params.api, 'loaded', this.data_loaded.ad.length)
                        }
                        else{
                            console.log('Ad', 'manager ' + this.params.api, 'wrong format from', domain)

                            pos++

                            request()
                        }
                    },
                    error: ()=>{
                        console.log('Ad', 'manager ' + this.params.api, 'no load from', domain)

                        pos++

                        request()
                    }
                })
            }
        }

        request()
    }

    coolingReady(){
        return Guard.time() - this.played.time > this.params.cooling
    }

    markCooling(){
        this.played.time = Guard.time()
    }

    whitoutGenres(whitout_genre){
        let movie = Storage.get('activity', '{}').movie

        try{
            let genres = whitout_genre.split(',').map(g => parseInt(g))

            if(genres.length && movie.genres.find(g => genres.find(gg => gg == g.id))){
                return true
            }
        }
        catch(e){}
    }

    orderTag(tags){
        tags.sort((a, b) => b.impressions - a.impressions)

        return tags[0]
    }

    filter(view){
        view = view.filter(v => !this.played.prerolls.find(pr => pr == v.name))

        if(!window.lampa_settings.developer.ads){
            view = view.filter(v => this.whitoutGenres(v.whitout_genre) !== true)
            view = view.filter(v => v.screen == (Platform.screen('tv') ? 'tv' : 'mobile') || v.screen == 'all')
            view = view.filter(v => v.platforms.indexOf(Platform.get()) !== -1 || v.platforms.indexOf('all') !== -1 || !v.platforms.length)
            view = view.filter(v => v.region.split(',').indexOf(VPN.code()) !== -1 || v.region.indexOf('all') !== -1 || !v.region.length)
        }

        console.log('Ad', 'manager ' + this.params.api, 'filter view', view)

        if(view.length){
            let preroll = this.orderTag(view)

            this.played.prerolls.push(preroll.name)

            return preroll
        }

        return null
    }

    get(first_run = false){
        if(first_run) this.played.prerolls = []

        return this.data_loaded.ad.length ? this.filter(this.data_loaded.ad) : null
    }
}

export default VastManager
