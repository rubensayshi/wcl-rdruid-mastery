angular.module('rdruid-mastery').service('settingsService', function($rootScope, $q) {
    var defaults = {
        apikey: "",
        character: "",
        reports: [],
        results: {},
        ignoreFriendlies: {}
    };
    angular.extend(this, defaults);

    var STORAGEID = "settings";

    var storage = rdruidMastery.leveldb('./settings.leveldb');

    var normalizeVersion = function(v) {
        return parseInt(v.match(/^v(\d)\.(\d)\.(\d)$/).map(function(v) {
            return ("00" + v).slice(-2);
        }).join(""), 10);
    };

    this._$isLoaded = null;
    /**
     * returns a promise to get the data, does not force update
     * @returns {null|*}
     */
    this.$isLoaded = function() {
        if (!this._$isLoaded) {
            this._$isLoaded = this.$load();
        }

        return this._$isLoaded;
    };

    /**
     * load the data from the database
     * @returns {*}
     */
    this.$load = function() {
        var self = this;

        var defer = $q.defer();

        storage.get(STORAGEID, function(err, doc) {
            if (err) {
                if (err.type === "NotFoundError") {
                    doc = null;
                } else {
                    defer.reject(err);
                    return;
                }
            }

            defer.resolve(doc);
        });

        return defer.promise.then(
            function(doc) {
                try {
                    doc = JSON.parse(doc);
                } catch (e) {
                    doc = null;
                }

                doc = doc || {};

                //update each of the values as defined in the defaults array
                angular.forEach(defaults, function(value, key) {
                    if (typeof doc[key] !== "undefined") {
                        self[key] = doc[key];
                    } else {
                        self[key] = defaults[key];
                    }
                });

                self.results[$rootScope.RESULTS_VERSION] = self.results[$rootScope.RESULTS_VERSION] || {};

                var currentVersion = normalizeVersion($rootScope.RESULTS_VERSION);
                var storeCleanedResults = false;
                Object.keys(self.results).forEach(function(_version) {
                    var version = normalizeVersion(_version);

                    if (version < currentVersion) {
                        delete self.results[_version];
                        storeCleanedResults = true;
                    }
                });

                if (storeCleanedResults) {
                    return settingsService.$store();
                }
            },
            function(e) { alert(e); throw e; }
        );
    };

    /**
     * update database copy of the data
     * @returns {*}     promise
     */
    this.$store = function() {
        var self = this;

        var defer = $q.defer();

        storage.get(STORAGEID, function(err, doc) {
            if (err) {
                if (err.type === "NotFoundError") {
                    doc = null;
                } else {
                    defer.reject(err);
                    return;
                }
            }

            defer.resolve(doc);
        });

        return defer.promise.then(
            function(doc) {
                try {
                    doc = JSON.parse(doc);
                } catch (e) {
                    doc = null;
                }

                doc = doc || {};

                //update each of the values as defined in the defaults array
                angular.forEach(defaults, function(value, key) {
                    doc[key] = self[key];
                });

                var defer = $q.defer();

                storage.put(STORAGEID, JSON.stringify(doc), function(err) {
                    if (err) {
                        defer.reject(err);
                        return;
                    }

                    defer.resolve();
                });

                return defer.promise;
            })
            .catch(function(e) { alert(e); throw e; });
    };
});
