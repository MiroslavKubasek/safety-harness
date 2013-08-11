var Reporter, USAGE, config, mocha, reporter, system, webpage,
    __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };

system = require('system');
webpage = require('webpage');

USAGE = "Usage: phantomjs mocha-phantomjs.coffee URL REPORTER [CONFIG]";

Reporter = (function() {

    function Reporter(reporter, config) {
        this.reporter = reporter;
        this.config = config;
        this.checkStarted = __bind(this.checkStarted, this);

        this.waitForRunMocha = __bind(this.waitForRunMocha, this);

        this.waitForInitMocha = __bind(this.waitForInitMocha, this);

        this.waitForMocha = __bind(this.waitForMocha, this);

        this.url = system.args[1];
        this.columns = parseInt(system.env.COLUMNS || 75) * .75 | 0;
        this.mochaStarted = false;
        this.mochaStartWait = this.config.timeout || 6000;
        this.startTime = Date.now();
        if (!this.url) {
            this.fail(USAGE);
        }
    }

    Reporter.prototype.run = function() {
        this.initPage();
        return this.loadPage();
    };

    Reporter.prototype.customizeMocha = function(options) {
        return Mocha.reporters.Base.window.width = options.columns;
    };

    Reporter.prototype.customizeOptions = function() {
        return {
            columns: this.columns
        };
    };

    Reporter.prototype.fail = function(msg, errno) {
        if (msg) {
            console.log(msg);
        }
        return phantom.exit(errno || 1);
    };

    Reporter.prototype.finish = function() {
        return phantom.exit(this.page.evaluate(function() {
            return mochaPhantomJS.failures;
        }));
    };

    Reporter.prototype.initPage = function() {
        var cookie, _i, _len, _ref,
            _this = this;
        this.page = webpage.create({
            settings: this.config.settings
        });
        if (this.config.headers) {
            this.page.customHeaders = this.config.headers;
        }
        _ref = this.config.cookies || [];
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
            cookie = _ref[_i];
            this.page.addCookie(cookie);
        }
        if (this.config.viewportSize) {
            this.page.viewportSize = this.config.viewportSize;
        }
        this.page.onConsoleMessage = function(msg) {
            return system.stdout.writeLine(msg);
        };
        this.page.onError = function(msg, traces) {
            var file, index, line, _j, _len1, _ref1;
            for (index = _j = 0, _len1 = traces.length; _j < _len1; index = ++_j) {
                _ref1 = traces[index], line = _ref1.line, file = _ref1.file;
                traces[index] = "  " + file + ":" + line;
            }
            return _this.fail("" + msg + "\n\n" + (traces.join('\n')));
        };
        return this.page.onInitialized = function() {
            return _this.page.evaluate(function() {
                return window.mochaPhantomJS = {
                    failures: 0,
                    ended: false,
                    started: false,
                    run: function() {
                        mochaPhantomJS.started = true;
                        return window.callPhantom({
                            'mochaPhantomJS.run': true
                        });
                    }
                };
            });
        };
    };

    Reporter.prototype.loadPage = function() {
        var _this = this;
        this.page.open(this.url);
        this.page.onLoadFinished = function(status) {
            _this.page.onLoadFinished = function() {};
            if (status !== 'success') {
                _this.onLoadFailed();
            }
            return _this.waitForInitMocha();
        };
        return this.page.onCallback = function(data) {
            if (data.hasOwnProperty('Mocha.process.stdout.write')) {
                system.stdout.write(data['Mocha.process.stdout.write']);
            } else if (data.hasOwnProperty('mochaPhantomJS.run')) {
                if (_this.injectJS()) {
                    _this.waitForRunMocha();
                }
            }
            return true;
        };
    };

    Reporter.prototype.onLoadFailed = function() {
        return this.fail("Failed to load the page. Check the url: " + this.url);
    };

    Reporter.prototype.injectJS = function() {
        if (this.page.evaluate(function() {
            return window.mocha != null;
        })) {
            this.page.injectJs('mocha-phantomjs/core_extensions.js');
            this.page.evaluate(this.customizeMocha, this.customizeOptions());
            return true;
        } else {
            this.fail("Failed to find mocha on the page.");
            return false;
        }
    };

    Reporter.prototype.runMocha = function() {
        if (this.config.useColors === false) {
            this.page.evaluate(function() {
                return Mocha.reporters.Base.useColors = false;
            });
        }
        this.page.evaluate(this.runner, this.reporter);
        this.mochaStarted = this.page.evaluate(function() {
            return mochaPhantomJS.runner || false;
        });
        if (this.mochaStarted) {
            this.mochaRunAt = new Date().getTime();
            return this.waitForMocha();
        } else {
            return this.fail("Failed to start mocha.");
        }
    };

    Reporter.prototype.waitForMocha = function() {
        var ended;
        ended = this.page.evaluate(function() {
            return mochaPhantomJS.ended;
        });
        if (ended) {
            return this.finish();
        } else {
            return setTimeout(this.waitForMocha, 100);
        }
    };

    Reporter.prototype.waitForInitMocha = function() {
        if (!this.checkStarted()) {
            return setTimeout(this.waitForInitMocha, 100);
        }
    };

    Reporter.prototype.waitForRunMocha = function() {
        if (this.checkStarted()) {
            return this.runMocha();
        } else {
            return setTimeout(this.waitForRunMocha, 100);
        }
    };

    Reporter.prototype.checkStarted = function() {
        var started;
        started = this.page.evaluate(function() {
            return mochaPhantomJS.started;
        });
        if (!started && this.mochaStartWait && this.startTime + this.mochaStartWait < Date.now()) {
            this.fail("Failed to start mocha: Init timeout", 255);
        }
        return started;
    };

    Reporter.prototype.runner = function(reporter) {
        var cleanup, _ref, _ref1;
        try {
            mocha.setup({
                reporter: reporter
            });
            mochaPhantomJS.runner = mocha.run();
            if (mochaPhantomJS.runner) {
                cleanup = function() {
                    mochaPhantomJS.failures = mochaPhantomJS.runner.failures;
                    return mochaPhantomJS.ended = true;
                };
                if ((_ref = mochaPhantomJS.runner) != null ? (_ref1 = _ref.stats) != null ? _ref1.end : void 0 : void 0) {
                    return cleanup();
                } else {
                    return mochaPhantomJS.runner.on('end', cleanup);
                }
            }
        } catch (error) {
            return false;
        }
    };

    return Reporter;

})();

reporter = system.args[2] || 'spec';

config = JSON.parse(system.args[3] || '{}');

mocha = new Reporter(reporter, config);

mocha.run();
