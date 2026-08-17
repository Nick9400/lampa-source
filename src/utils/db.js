import Subscribe from '../utils/subscribe'

export default class IndexedDB {
    constructor(database_name, tables = [], version = 3) {
        this.listener = Subscribe()

        this.database_name = 'lampa_' + database_name
        
        this.tables = tables

        this.version = version

        this.db = null
        this.logs = true
    }

    log(err,store_name,key){
        if(this.logs) console.log('DB', this.database_name + (store_name ? '_' + store_name : '') + (key ? ' -> [' + key + ']' : ''), err)
    }

    errorMessage(error, fallback){
        if(!error) return fallback

        return error.message || error.name || error
    }

    /**
     * Обёртка над транзакцией IndexedDB: ловит abort/QuotaExceeded, когда сам request молчит
     */
    withStore(store_name, mode, key, handler){
        return new Promise((resolve, reject) => {
            if (!this.db) {
                return this.log('Database not open',store_name,key),reject('Database not open')
            }

            let finished = false

            const done = (error, value)=>{
                if(finished) return

                finished = true

                if(error) reject(error)
                else resolve(value)
            }

            try{
                const transaction = this.db.transaction([store_name], mode)
                const objectStore = transaction.objectStore(store_name)

                transaction.onabort = ()=>{
                    let err = transaction.error || 'Transaction aborted'

                    this.log(this.errorMessage(err, 'Transaction aborted'),store_name,key)

                    done(err)
                }

                transaction.onerror = ()=>{
                    let err = transaction.error || 'Transaction error'

                    this.log(this.errorMessage(err, 'Transaction error'),store_name,key)

                    done(err)
                }

                handler(objectStore, done)
            }
            catch(e){
                this.log(this.errorMessage(e, 'Transaction failed'),store_name,key)

                done(e)
            }
        })
    }

    bindRequest(request, done, store_name, key, fallback){
        request.onerror = ()=>{
            let err = request.error || fallback

            this.log(this.errorMessage(err, fallback),store_name,key)

            done(err)
        }

        return request
    }

    /**
     * Открытие базы данных
     * @returns {Promise<void>}
     */
    openDatabase() {
        return new Promise((resolve, reject) => {
            let Base = window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB;

            if (!Base) return this.log('Not supported'),reject('Not supported')

            if(!this.tables.length) return this.log('No tables'),reject('No tables')

            const request = Base.open(this.database_name, this.version)

            request.onerror = (event)=> {
                this.log(request.error || 'An error occurred while opening the database')

                reject(request.error || 'An error occurred while opening the database')
            }

            request.onblocked = ()=>{
                this.log('Database blocked')
            }

            request.onsuccess = (event) => {
                this.db = event.target.result

                this.db.onversionchange = ()=>{
                    this.log('Version change, closing')

                    try{
                        this.db.close()
                    }
                    catch(e){}

                    this.db = null
                }

                resolve()
            }

            request.onupgradeneeded = (event) => {
                const db = event.target.result

                this.log('OnUpgradeNeeded')
                
                this.tables.forEach(name => {
                    if(!db.objectStoreNames.contains(name)){
                        this.log('Create table - ' + name)

                        db.createObjectStore(name, { keyPath: 'key' })
                    }
                })
            }
        })
    }

    /**
     * Добавление данных в таблицу
     * @param {string} store_name - Название таблицы
     * @param {string} key - Ключ записи
     * @param {any} value - Значение записи
     * @returns {Promise<void>}
     */
    addData(store_name,key, value) {
        return this.withStore(store_name, 'readwrite', key, (objectStore, done)=>{
            const addRequest = objectStore.add({ key, value, time: Date.now() })

            this.bindRequest(addRequest, done, store_name, key, 'An error occurred while adding data')

            addRequest.onsuccess = ()=>done()
        })
    }

    /**
     * Получение данных из таблицы
     * @param {string} store_name - Название таблицы
     * @param {string} key - Ключ записи, если не указан, вернет все записи
     * @param {number} life_time - Время жизни записи в минутах. -1 - без ограничений
     * @param {boolean} return_meta - Возвращать мета данные (ключ, время) вместе со значением
     * @returns {Promise<any>}
     */
    getData(store_name, key, life_time = -1, return_meta = false) {
        return this.withStore(store_name, 'readonly', key, (objectStore, done)=>{
            const getRequest = key ? objectStore.get(key) : objectStore.getAll()

            this.bindRequest(getRequest, done, store_name, key, 'An error occurred while retrieving data')

            getRequest.onsuccess = (event) => {
                const result = event.target.result
                const alive = (record)=>{
                    if(!record) return false
                    if(life_time == -1) return true

                    return Date.now() < record.time + (life_time * 1000 * 60)
                }

                if(key){
                    if(result && alive(result)) done(null, return_meta ? result : result.value)
                    else done(null, null)
                }
                else{
                    let list = Array.isArray(result) ? result : []

                    if(life_time != -1) list = list.filter(alive)

                    done(null, return_meta ? list : list.map(r=>r.value))
                }
            }
        })
    }

    /**
     * Получение данных из таблицы без ошибки
     * @param {string} store_name - Название таблицы
     * @param {string} key - Ключ записи
     * @param {number} life_time - Время жизни записи в минутах. -1 - без ограничений
     * @param {boolean} return_meta - Возвращать мета данные (ключ, время) вместе со значением
     * @returns {Promise<any>}
     */
    getDataAnyCase(store_name, key, life_time, return_meta = false) {
        return new Promise((resolve, reject) => {
            this.getData(store_name, key, life_time, return_meta).then(resolve).catch(()=>{
                resolve(null)
            })
        })
    }

    /**
     * Обновление данных в таблице
     * @param {string} store_name - Название таблицы
     * @param {string} key - Ключ записи
     * @param {any} value - Новое значение записи
     * @returns {Promise<void>}
     */
    updateData(store_name, key, value) {
        return this.withStore(store_name, 'readwrite', key, (objectStore, done)=>{
            const getRequest = objectStore.get(key)

            this.bindRequest(getRequest, done, store_name, key, 'An error occurred while updating data')

            getRequest.onsuccess = ()=>{
                const result = getRequest.result

                if (result) {
                    result.value = value
                    result.time = Date.now()

                    const updateRequest = objectStore.put(result)

                    this.bindRequest(updateRequest, done, store_name, key, 'An error occurred while updating data')

                    updateRequest.onsuccess = ()=>done()
                } else {
                    this.log('No data found with the given key',store_name,key)

                    done('No data found with the given key')
                }
            }
        })
    }

    /**
     * Перезапись данных в таблице (если нет, то создаст новую запись)
     * @param {string} store_name - Название таблицы
     * @param {string} key - Ключ записи
     * @param {any} value - Новое значение записи
     * @returns {Promise<void>}
     */
    rewriteData(store_name, key, value){
        return this.withStore(store_name, 'readwrite', key, (objectStore, done)=>{
            const addRequest = objectStore.put({ key, value, time: Date.now() })

            this.bindRequest(addRequest, done, store_name, key, 'An error occurred while rewrite data')

            addRequest.onsuccess = ()=>done()
        })
    }

    /**
     * Удаление данных из таблицы
     * @param {string} store_name - Название таблицы
     * @param {string} key - Ключ записи
     * @returns {Promise<void>}
     */
    deleteData(store_name, key) {
        return this.withStore(store_name, 'readwrite', key, (objectStore, done)=>{
            const deleteRequest = objectStore.delete(key)

            this.bindRequest(deleteRequest, done, store_name, key, 'An error occurred while deleting data')

            deleteRequest.onsuccess = ()=>done()
        })
    }

    /**
     * Очистка таблицы
     * @param {string} store_name - Название таблицы
     * @returns {Promise<void>}
     */
    clearTable(store_name) {
        return this.withStore(store_name, 'readwrite', undefined, (objectStore, done)=>{
            const clearRequest = objectStore.clear()

            this.bindRequest(clearRequest, done, store_name, undefined, 'An error occurred while clearing the table')

            clearRequest.onsuccess = ()=>done()
        })
    }

    /**
     * Очистка всех таблиц
     * @returns {Promise<void>}
     */
    clearAll() {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                return this.log('Database not open'),reject('Database not open')
            }

            const tableNames = Array.from(this.db.objectStoreNames)

            Promise.all(tableNames.map(n=>this.clearTable(n))).then(resolve).catch(reject)
        })
    }
}
