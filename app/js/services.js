'use strict';

/**
 * This is the working indicator
 */

angular.module('gisto.services', []);

angular.module('requestHandler', [], function ($provide) {
    $provide.factory('requestHandler', function ($http) {

        function handleRequest(args) {

            if (!args.stopNotification) { // stop the notification if requested
                $('.loading').show();
            }

            var http = $http(args);

            var requestService = {
                success: function (callback) {
                    http.success(function (data, status, headers, config) {
                        // only hide the notification if there are no pending requests
                        if ($http.pendingRequests.length < 1) {
                            $('.loading').slideUp();
                        }
                        callback(data, status, headers, config); // call the user callback
                    });
                    return requestService; // return the object for chaining
                },
                error: function (callback) {
                    http.error(function (data, status, headers, config) {
                        // only hide the notification if there are no pending requests
                        if ($http.pendingRequests.length < 1) {
                            $('.loading').slideUp();
                        }
                        callback(data, status, headers, config); // call the user callback
                    });
                    return requestService; // return the object for chaining
                }
            };

            return requestService;
        }

        // create the main function mimicking $http
        var requestHandler = function (args) {
            return handleRequest(args);
        };

        // add $http sub methods support

        requestHandler.delete = function (url, config) {
            config = config || {};
            config.method = 'delete';
            config.url = url;
            return handleRequest(config);
        };

        requestHandler.get = function (url, config) {
            config = config || {};
            config.method = 'get';
            config.url = url;
            return handleRequest(config);
        };

        requestHandler.jsonp = function (url, config) {
            config = config || {};
            config.method = 'jsonp';
            config.url = url;
            return handleRequest(config);
        };

        requestHandler.post = function (url, data, config) {
            config = config || {};
            config.method = 'post';
            config.url = url;
            config.data = data;
            return handleRequest(config);
        };

        requestHandler.put = function (url, data, config) {
            config = config || {};
            config.method = 'put';
            config.url = url;
            config.data = data;
            return handleRequest(config);
        };

        return requestHandler;

    });
});

angular.module('gitHubAPI', ['gistData', 'appSettings', 'requestHandler'], function ($provide) {
    $provide.factory('ghAPI', function ($http, gistData, appSettings, requestHandler) {
        var api_url = 'https://api.github.com/gists',
            token = appSettings.get('token');
        var api = {

            setToken: function (newToken) {
                token = newToken;
            },

            // POST /authorizations
            login: function (user, pass, callback) {
                requestHandler({
                    method: 'POST',
                    url: 'https://api.github.com/authorizations',
                    data: {"scopes": [
                        "gist"
                    ],
                        "note": "Gisto"
                    },
                    headers: {
                        "Authorization": "Basic " + btoa(user + ":" + pass),
                        "Content-Type": "application/x-www-form-urlencoded"
                    }
                }).success(function (data, status, headers, config) {
                        return callback({
                            data: data,
                            status: status,
                            headers: headers(),
                            config: config
                        });
                    }).error(function (data, status, headers, config) {
                        return callback({
                            data: data,
                            status: status,
                            headers: headers(),
                            config: config
                        });
                    });
            },

            // GET /gists
            gists: function (updateOnly, pageNumber) {
                var url = pageNumber ? api_url + '?page=' + pageNumber : api_url,
                    headers = {
                        Authorization: 'token ' + JSON.parse(localStorage.settings).token
                    };

                if (updateOnly) {
                    headers['If-Modified-Since'] = localStorage.gistsLastUpdated;
                }

                requestHandler({
                    method: 'GET',
                    url: url,
                    headers: headers
                }).success(function (data, status, headers, config) {
                        for (var item in data) { // process and arrange data
                            data[item].tags = data[item].description ? data[item].description.match(/(#[A-Za-z0-9\-\_]+)/g) : [];
                            data[item].single = {};
                            data[item].filesCount = Object.keys(data[item].files).length;
                        }

                        // Set lastUpdated for 60 sec cache
                        data.lastUpdated = new Date();

                        // Set avatar
                        appSettings.setOne('avatar', data[item].user.gravatar_id);
                        gistData.list.push.apply(gistData.list, data); // transfer the data to the data service
                        // localStorage.gistsLastUpdated = data.headers['last-modified'];

                        var header = headers();
                        if (header.link) {
                            var links = header.link.split(',');
                            for (var link in links) {
                                link = links[link];
                                if (link.indexOf('rel="next') > -1) {
                                    var nextPage = link.match(/[0-9]+/)[0];

                                    if (!pageNumber || nextPage > pageNumber) {
                                        api.gists(null, nextPage);
                                        return; // end the function before it reaches starred gist list call
                                    }
                                }
                            }
                        }

                        // end of the paging calls
                        api.starred(function(response){
                            for (var s in response.data) {
                                var gist = gistData.getGistById(response.data[s].id);
                                if (gist) {
                                    gist.has_star = true;
                                }
                            }
                        });

                    }).error(function (data, status, headers, config) {
                        console.log({
                            data: data,
                            status: status,
                            headers: headers(),
                            config: config
                        });
                    });
            },

            // GET /gists/:id
            gist: function (id) {
                var gist = gistData.getGistById(id); // get the currently viewed gist

                requestHandler({
                    method: 'GET',
                    url: api_url + '/' + id,
                    headers: {
                        Authorization: 'token ' + token
                    }
                }).success(function (data, status, headers, config) {
                        api.is_starred(data.id, function (response) {
                            if (response.status === 204) {
                                data.starred = true;
                            } else {
                                data.starred = false;
                            }
                            console.log('Is it starred: ' + data.starred);
                        });

                        // save timestamp of pull
                        data.lastUpdated = new Date();
                        console.log(data.lastUpdated);

                        gist.single = data; // update the current gist with the new data

                    }).error(function (data, status, headers, config) {
                        console.log({
                            data: data,
                            status: status,
                            headers: headers(),
                            config: config
                        });
                    });
            },

            // POST /gists
            create: function (data, callback) {
                requestHandler({
                    method: 'POST',
                    url: api_url,
                    data: data,
                    headers: {
                        Authorization: 'token ' + token
                    }
                }).success(function (data, status, headers, config) {
                        return callback({
                            data: data,
                            status: status,
                            headers: headers(),
                            config: config
                        });
                    }).error(function (data, status, headers, config) {
                        return callback({
                            data: data,
                            status: status,
                            headers: headers(),
                            config: config
                        });
                    });
            },

            // PATCH /gists/:id
            edit: function (id, data, callback) {
                requestHandler({
                    method: 'PATCH',
                    url: api_url + '/' + id,
                    data: data,
                    headers: {
                        Authorization: 'token ' + token
                    }
                }).success(function (data, status, headers, config) {
                        return callback({
                            data: data,
                            status: status,
                            headers: headers(),
                            config: config
                        });
                    }).error(function (data, status, headers, config) {
                        return callback({
                            data: data,
                            status: status,
                            headers: headers(),
                            config: config
                        });
                    });
            },

            // DELETE /gists/:id
            delete: function (id, callback) {
                requestHandler({
                    method: 'DELETE',
                    url: api_url + '/' + id,
                    headers: {
                        Authorization: 'token ' + token
                    }
                }).success(function (data, status, headers, config) {

                        return callback({
                            data: data,
                            status: status,
                            headers: headers(),
                            config: config
                        });
                    }).error(function (data, status, headers, config) {
                        return callback({
                            data: data,
                            status: status,
                            headers: headers(),
                            config: config
                        });
                    });
            },

            // GET /gists/:id/comments
            comments: function (id, callback) {
                requestHandler({
                    method: 'GET',
                    url: api_url + '/' + id + '/comments',
                    headers: {
                        Authorization: 'token ' + token
                    }
                }).success(function (data, status, headers, config) {
                        return callback({
                            data: data,
                            status: status,
                            headers: headers(),
                            config: config
                        });
                    }).error(function (data, status, headers, config) {
                        return callback({
                            data: data,
                            status: status,
                            headers: headers(),
                            config: config
                        });
                    });
            },

            // GET /gists/starred
            starred: function (callback, pageNumber) {
                var url = pageNumber ? api_url + '/starred' + '?page=' + pageNumber : api_url + '/starred';
                requestHandler({
                    method: 'GET',
                    url: url,
                    headers: {
                        Authorization: 'token ' + token
                    }
                }).success(function (data, status, headers, config) {

                        // return the data
                        callback({
                            data: data,
                            status: status,
                            headers: headers(),
                            config: config
                        });

                        var header = headers();
                        if (header.link) {
                            var links = header.link.split(',');
                            for (var link in links) {
                                link = links[link];
                                if (link.indexOf('rel="next') > -1) {
                                    var nextPage = link.match(/[0-9]+/)[0];

                                    if (!pageNumber || nextPage > pageNumber) {
                                        api.starred(callback, nextPage);
                                        return; // end the function before it reaches starred gist list call
                                    }
                                }
                            }
                        }

                    }).error(function (data, status, headers, config) {
                        return callback({
                            data: data,
                            status: status,
                            headers: headers(),
                            config: config
                        });
                    });
            },

            // PUT /gists/:id/star
            star: function (id, callback) {
                requestHandler({
                    method: 'PUT',
                    url: api_url + '/' + id + '/star',
                    headers: {
                        Authorization: 'token ' + token
                    }
                }).success(function (data, status, headers, config) {
                        return callback({
                            data: data,
                            status: status,
                            headers: headers(),
                            config: config
                        });
                    }).error(function (data, status, headers, config) {
                        return callback({
                            data: data,
                            status: status,
                            headers: headers(),
                            config: config
                        });
                    });
            },

            // DELETE /gists/:id/star
            unstar: function (id, callback) {
                requestHandler({
                    method: 'DELETE',
                    url: api_url + '/' + id + '/star',
                    headers: {
                        Authorization: 'token ' + token
                    }
                }).success(function (data, status, headers, config) {
                        return callback({
                            data: data,
                            status: status,
                            headers: headers(),
                            config: config
                        });
                    }).error(function (data, status, headers, config) {
                        return callback({
                            data: data,
                            status: status,
                            headers: headers(),
                            config: config
                        });
                    });
            },

            // GET /gists/:id/star
            is_starred: function (id, callback) {
                requestHandler({
                    method: 'get',
                    url: api_url + '/' + id + '/star',
                    headers: {
                        Authorization: 'token ' + token
                    }
                }).success(function (data, status, headers, config) {
                        return callback({
                            data: data,
                            status: status,
                            headers: headers(),
                            config: config
                        });
                    }).error(function (data, status, headers, config) {
                        return callback({
                            data: data,
                            status: status,
                            headers: headers(),
                            config: config
                        });
                    });
            },

            // POST /gists/:id/forks
            fork: function () {
            }
        };

        return api;
    });
});

angular.module('gistData', [], function ($provide) {
    $provide.factory('gistData', function () {
        var dataService = {
            list: [],
            getGistById: function (id) {
                for (var gist in dataService.list) {
                    gist = dataService.list[gist];
                    if (gist.id === id) {
                        return gist;
                    }
                }
            }
        };
        return dataService;
    });
});

angular.module('appSettings', [], function ($provide) {
    $provide.factory('appSettings', function () {
        var settings = {

            theme_list: ['default', 'gisto', 'nite', 'dark', 'dark-blue'],
            font_size: ['10','11','12','13','14','15','16','17','18','19','20'],
            editor_theme_list: [
                "ambiance",
                "chaos",
                "chrome",
                "clouds",
                "clouds_midnight",
                "cobalt",
                "crimson_editor",
                "dawn",
                "dreamweaver",
                "eclipse",
                "github",
                "idle_fingers",
                "kr_theme",
                "merbivore",
                "merbivore_soft",
                "monokai",
                "mono_industrial",
                "pastel_on_dark",
                "solarized_dark",
                "solarized_light",
                "terminal",
                "textmate",
                "tomorrow",
                "tomorrow_night",
                "tomorrow_night_blue",
                "tomorrow_night_bright",
                "tomorrow_night_eighties",
                "twilight",
                "vibrant_ink",
                "xcode"
            ],

            isLoggedIn: function (callback) {

                if (localStorage.settings && JSON.parse(localStorage.settings).token !== undefined) {
                    return true;
                } else {
                    document.location.href = '#/login';
                }
            },

            logOut: function () {
                delete localStorage.settings;
                document.location.href = '#/login';
            },

            getAll: function () {
                var all_settings = JSON.parse(localStorage.settings);
                return all_settings;
            },

            get: function (name) {
                if (settings.isLoggedIn()) {
                    var storage = JSON.parse(localStorage.settings);
                    return storage[name];
                }
            },

            set: function (data, callback) {

                var settings = JSON.parse(localStorage.settings) || {};

                for (var key in data) {
                    settings[key] = data[key];
                }
                settings.last_modified = new Date().toUTCString();
                localStorage.settings = JSON.stringify(settings);

                if (callback) {
                    return callback({
                        status: 'ok'
                    });
                }

            },

            setOne: function (key, new_data, callback) {
                var old_data = settings.getAll();
                old_data[key] = new_data;
                settings.set(old_data);
            }
        };

        return settings;
    });
});