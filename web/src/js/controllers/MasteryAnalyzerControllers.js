angular.module('rdruid-mastery')
    .controller('MasteryAnalyzerCtrl', function($scope, $state, settingsService) {
        $scope.state = {
            reportID: "",
            character: "",
            apikey: "",
            fightID: null,
            fight: null,
            friendlies: null,
            ignoreFriendliesRaw: null,
            ignoreFriendlies: {},
            events: null,
            parser: null
        };

        $scope.state.apikey = settingsService.apikey;
        $scope.state.character = settingsService.character;

        var requestcache = rdruidMastery.leveldb('./requestcache.leveldb');
        var _wclapi = null;
        $scope.wclapi = function() {
            if (!_wclapi) {
                _wclapi = new rdruidMastery.WCLAPI($scope.state.apikey, requestcache, "http://localhost:8000/v1");
            }

            return _wclapi;
        };

        $scope.gotoInput = function() {
            $scope.state.reportID = null;
            $scope.state.fightID = null;
            $scope.state.fight = null;
            $scope.state.events = null;
            $scope.state.friendlies = null;
            $scope.state.parser = null;

            $state.go('app.mastery-analyzer.input');
        };

        $scope.gotoChooseReport = function() {
            $scope.state.reportID = null;
            $scope.state.fightID = null;
            $scope.state.fight = null;
            $scope.state.events = null;
            $scope.state.friendlies = null;
            $scope.state.parser = null;

            $state.go('app.mastery-analyzer.choose-report');
        };

        $scope.gotoChooseFight = function() {
            $scope.state.fightID = null;
            $scope.state.fight = null;
            $scope.state.events = null;
            $scope.state.friendlies = null;
            $scope.state.parser = null;

            $state.go('app.mastery-analyzer.choose-fight', {
                reportID: $scope.state.reportID
            });
        };

        $scope.checkState = function($stateParams) {
            $stateParams = $stateParams || {};

            if (!$scope.state.apikey || !$scope.state.character) {
                $state.go('app.mastery-analyzer.input');
                return false;
            }

            if (!$scope.state.reportID && $stateParams.reportID) {
                $scope.state.reportID = $stateParams.reportID;
            }

            if (!$scope.state.reportID) {
                if ($state.is('app.mastery-analyzer.choose-report')) {
                    return true;
                } else {
                    $state.go('app.mastery-analyzer.choose-report');
                    return false;
                }
            }

            if (!$scope.state.fightID && $stateParams.fightID) {
                $scope.state.fightID = $stateParams.fightID;
            }

            if (!$scope.state.fightID) {
                if ($state.is('app.mastery-analyzer.choose-fight')) {
                    return true;
                } else {
                    $state.go('app.mastery-analyzer.choose-fight');
                    return false;
                }
            }

            if (!$scope.state.fight || !$scope.state.events) {
                if ($state.is('app.mastery-analyzer.download-fight')) {
                    return true;
                } else {
                    $state.go('app.mastery-analyzer.download-fight');
                    return false;
                }
            }

            if (!$scope.state.parser) {
                if ($state.is('app.mastery-analyzer.parse-fight')) {
                    return true;
                } else {
                    $state.go('app.mastery-analyzer.parse-fight');
                    return false;
                }
            }

            return true;
        }
    });


angular.module('rdruid-mastery')
    .controller('MasteryAnalyzerInputCtrl', function($scope, $state, settingsService) {
        $scope.continue = function() {
            if (!$scope.state.apikey || !$scope.state.character) {
                alert('NEED MORE DETAILS');
                return;
            }

            settingsService.apikey = $scope.state.apikey;
            settingsService.character = $scope.state.character;

            settingsService.$store()
                .then(function() {
                    $state.go('app.mastery-analyzer.choose-report');
                }).catch(function(e) {
                    alert(e);
                });
        };
    });


angular.module('rdruid-mastery')
    .controller('MasteryAnalyzerChooseReportCtrl', function($scope, $state, $stateParams, $timeout, settingsService) {
        if (!$scope.checkState($stateParams)) {
            return;
        }

        $scope.reports = settingsService.reports || [];
        $scope.loading = false;

        $scope.addReport = function(reportID) {
            var report = {id: reportID, name: reportID};

            settingsService.reports = settingsService.reports || [];
            settingsService.reports.push(report);

            return settingsService.$store().then(function() {
                return $scope.chooseReport(report);
            });
        };

        $scope.chooseReport = function(report) {
            return $state.go('app.mastery-analyzer.choose-fight', {
                reportID: report.id
            });
        };
    });


angular.module('rdruid-mastery')
    .controller('MasteryAnalyzerChooseFightCtrl', function($scope, $stateParams, $state, $timeout) {
        if (!$scope.checkState($stateParams)) {
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
                reportID: $scope.state.reportID,
                fightID: fight.id
            });
        };
    });


angular.module('rdruid-mastery')
    .controller('MasteryAnalyzerDownloadFightCtrl', function($scope, $state, $timeout, $stateParams) {
        if (!$scope.checkState($stateParams)) {
            return;
        }

        var wclapi = $scope.wclapi();

        wclapi.getFights($scope.state.reportID)
            .then(function(fights) {
                // find the fight
                var fight = fights.filter(function(fight) {
                    return fight.id == $scope.state.fightID;
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
                                            reportID: $scope.state.reportID,
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
    .controller('MasteryAnalyzerParseFightCtrl', function($scope, $state, $timeout, $stateParams, settingsService) {
        if (!$scope.checkState($stateParams)) {
            return;
        }

        $scope.loading = true;
        $scope.parsing = false;

        $scope.continueInputFriendlies = function() {
            $scope.state.ignoreFriendlies[ignoreFriendliesKey] = $scope.state.ignoreFriendliesRaw
                .split(",")
                .map(function(ignore) { return ignore.trim(); })
                .filter(function(ignore) { return !!ignore; }) || [];

            if (settingsService.ignoreFriendlies instanceof Array) {
                settingsService.ignoreFriendlies = {};
            }
            settingsService.ignoreFriendlies[ignoreFriendliesKey] = $scope.state.ignoreFriendlies[ignoreFriendliesKey];

            return settingsService.$store().then(function() {
                return $scope.parse();
            });
        };

        $scope.parse = function() {
            $scope.state.parser = new rdruidMastery.Parser($scope.state.fight, $scope.state.friendlies, $scope.state.events, $scope.state.ignoreFriendlies[ignoreFriendliesKey] || []);

            $timeout(function() {
                $scope.loading = false;
                $scope.parsing = true;
                $scope.state.parser.parse();

                $state.go('app.mastery-analyzer.result', {
                    reportID: $scope.state.reportID,
                    fightID: $scope.state.fight.id
                });
            });
        };

        var ignoreFriendliesKey = $scope.state.reportID + ":" + $scope.state.fight.id;

        if ($scope.state.fight.boss === 1854) {
            $scope.loading = false;
            $scope.inputFriendlies = true;
            $scope.state.ignoreFriendlies[ignoreFriendliesKey] = settingsService.ignoreFriendlies[ignoreFriendliesKey] || [];
            $scope.state.ignoreFriendliesRaw = $scope.state.ignoreFriendlies[ignoreFriendliesKey].join(", ");
        } else {
            $scope.parse();
        }
    });


angular.module('rdruid-mastery')
    .controller('MasteryAnalyzerResultCtrl', function($scope, $state, $timeout, $stateParams) {
        if (!$scope.checkState($stateParams)) {
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
