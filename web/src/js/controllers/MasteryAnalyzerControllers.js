angular.module('rdruid-mastery')
    .controller('MasteryAnalyzerCtrl', function($scope, settingsService) {
        $scope.state = {
            reportID: "",
            character: "",
            apikey: "",
            fight: null,
            friendlies: null,
            ignoreFriendliesRaw: null,
            ignoreFriendlies: null,
            events: null,
            parser: null
        };

        settingsService.$isLoaded().then(function() {
            $scope.state.apikey = settingsService.apikey;
            $scope.state.character = settingsService.character;
            $scope.state.reportID = settingsService.reportID;
            $scope.state.ignoreFriendlies = settingsService.ignoreFriendlies || [];
            $scope.state.ignoreFriendliesRaw = $scope.state.ignoreFriendlies.join("\n");
        });

        var requestcache = rdruidMastery.leveldb('./requestcache.leveldb');
        var _wclapi = null;
        $scope.wclapi = function() {
            if (!_wclapi) {
                _wclapi = new rdruidMastery.WCLAPI($scope.state.apikey, requestcache, "http://localhost:8000/v1");
            }

            return _wclapi;
        };

        $scope.stateOk = function() {
            return !!$scope.state.reportID;
        }
    });


angular.module('rdruid-mastery')
    .controller('MasteryAnalyzerInputCtrl', function($scope, $state, settingsService) {
        $scope.continue = function() {
            if (!$scope.stateOk()) {
                alert('NEED MORE DETAILS');
                return;
            }

            settingsService.$isLoaded().then(function() {
                settingsService.apikey = $scope.state.apikey;
                settingsService.character = $scope.state.character;
                settingsService.reportID = $scope.state.reportID;
                $scope.state.ignoreFriendlies = $scope.state.ignoreFriendliesRaw
                    .split(",")
                    .map(function(ignore) { return ignore.trim(); })
                    .filter(function(ignore) { return !!ignore; });
                settingsService.ignoreFriendlies = $scope.state.ignoreFriendlies;

                return settingsService.$store();
            }).then(function() {
                $state.go('app.mastery-analyzer.choose-fight');
            }).catch(function(e) {
                alert(e);
            });
        };
    });


angular.module('rdruid-mastery')
    .controller('MasteryAnalyzerChooseFightCtrl', function($scope, $state, $timeout) {
        if (!$scope.stateOk()) {
            $state.go('app.mastery-analyzer.input');
            return;
        }

        $scope.onlyBosses = true;
        $scope.onlyKills = false;
        $scope.loading = true;
        $scope.fights = [];

        $scope.wclapi().getFights($scope.state.reportID).then(
            function(fights) {
                $timeout(function() {
                    $scope.fights = fights;
                    $scope.loading = false;
                });
            },
            function(e) {
                alert("" + e);
            }
        );

        $scope.chooseFight = function(fight) {
            $state.go('app.mastery-analyzer.download-fight', {
                fightID: fight.id
            });
        };
    });


angular.module('rdruid-mastery')
    .controller('MasteryAnalyzerDownloadFightCtrl', function($scope, $state, $timeout, $stateParams) {
        if (!$scope.stateOk()) {
            $state.go('app.mastery-analyzer.input');
            return;
        }

        var wclapi = $scope.wclapi();

        wclapi.getFights($scope.state.reportID)
            .then(function(fights) {
                // find the fight
                var fight = fights.filter(function(fight) {
                    return fight.id == $stateParams.fightID;
                });

                if (fight.length !== 1) {
                    throw new Error("fightID not found");
                }

                return fight[0];
            })
            .then(function(fight) {
                $scope.state.fight = fight;

                return wclapi.getFriendlies($scope.state.reportID)
                    .then(function(friendlies) {
                        $scope.state.friendlies = friendlies;
                    })
                    .then(function() {
                        // we need the actorID instead of the name
                        return wclapi.getActorID($scope.state.reportID, $scope.state.character)
                            .then(function(actorID) {
                                // get all events
                                return wclapi.getEvents($scope.state.reportID, actorID, fight.start_time, fight.end_time)
                                    .then(function(events) {

                                        $scope.state.events = events;

                                        $state.go('app.mastery-analyzer.parse-fight', {
                                            fightID: fight.id
                                        });
                                    })
                            });
                    });
            })
            .fail(function(e) {
                alert("" + e);
            });
    });


angular.module('rdruid-mastery')
    .controller('MasteryAnalyzerParseFightCtrl', function($scope, $state, $timeout, $stateParams) {
        if (!$scope.stateOk()) {
            $state.go('app.mastery-analyzer.input');
            return;
        }
        if (!$scope.state.fight || !$scope.state.events) {
            $state.go('app.mastery-analyzer.download-fight', {fightID: $stateParams.fightID});
            return;
        }

        $scope.state.parser = new rdruidMastery.Parser($scope.state.fight, $scope.state.friendlies, $scope.state.events, $scope.state.ignoreFriendlies || []);

        $timeout(function() {
            $scope.state.parser.parse();

            $state.go('app.mastery-analyzer.result', {
                fightID: $scope.state.fight.id
            });
        })
    });


angular.module('rdruid-mastery')
    .controller('MasteryAnalyzerResultCtrl', function($scope, $state, $timeout, $stateParams) {
        if (!$scope.stateOk()) {
            $state.go('app.mastery-analyzer.input');
            return;
        }
        if (!$scope.state.fight || !$scope.state.events) {
            $state.go('app.mastery-analyzer.download-fight', {fightID: $stateParams.fightID});
            return;
        }
        if (!$scope.state.parser) {
            $state.go('app.mastery-analyzer.parse-fight', {fightID: $stateParams.fightID});
            return;
        }

        var masteryStacks = $scope.state.parser.masteryStacks;
        var table = [];

        // sum up the total HoT time
        var total = 0;
        for (var i = 1; i <= rdruidMastery.Parser.MAX_HOTS; i++) {
            total += masteryStacks[i];
        }

        // weighted time (for avg HoTs calc)
        var avgsum = 0;
        // cummulative time
        var cummul = 0;

        // loop from high to low
        for (var i = rdruidMastery.Parser.MAX_HOTS; i > 0; i--) {
            var stacks = i;
            var time = masteryStacks[stacks];

            // add time to cummulative time
            cummul += time;

            // add time to weighted time
            avgsum += (stacks * time);

            // don't start printing until we have something to print
            if (cummul > 0) {
                table.push({
                    stacks: stacks,
                    time: (time / 1000),
                    percentage: (time / total * 100),
                    ctime: (cummul / 1000),
                    cpercentage: (cummul / total * 100)
                });
            }
        }

        $scope.table = table;
        $scope.avghots = (avgsum / total);
    });
