
/*global WildRydes _config*/

var WildRydes = window.WildRydes || {};
WildRydes.map = WildRydes.map || {};

(function rideScopeWrapper($) {
    var authToken;

    // Get the Cognito authentication token
    WildRydes.authToken
        .then(function setAuthToken(token) {
            if (token) {
                authToken = token;
            } else {
                window.location.href = '/signin.html';
            }
        })
        .catch(function handleTokenError(error) {
            console.error('Authentication token error:', error);
            alert('Authentication failed. Please sign in again.');
            window.location.href = '/signin.html';
        });

    // Request a unicorn from API Gateway
    function requestUnicorn(pickupLocation) {
        if (!pickupLocation) {
            alert('Please select a pickup location on the map.');
            return;
        }

        if (!authToken) {
            alert('Authentication token is not ready. Please try again.');
            return;
        }

        if (!_config.api || !_config.api.invokeUrl) {
            console.error('API URL is missing in js/config.js');
            alert('API configuration is missing.');
            return;
        }

        var apiUrl = _config.api.invokeUrl.replace(/\/+$/, '') + '/ride';

        var requestData = {
            PickupLocation: {
                Latitude: pickupLocation.latitude,
                Longitude: pickupLocation.longitude
            }
        };

        console.log('Sending ride request to:', apiUrl);
        console.log('Pickup location:', requestData.PickupLocation);

        $.ajax({
            method: 'POST',
            url: apiUrl,
            headers: {
                Authorization: authToken
            },
            data: JSON.stringify(requestData),
            contentType: 'application/json',
            dataType: 'json',

            success: function (result, textStatus, jqXHR) {
                console.log('HTTP Status:', jqXHR.status);
                console.log('Ride API response:', result);

                // Some API Gateway configurations return a JSON
                // object whose body is itself a JSON string.
                if (result && typeof result.body === 'string') {
                    try {
                        result = JSON.parse(result.body);
                    } catch (error) {
                        console.error('Could not parse response body:', error);
                    }
                }

                if (result && result.Error) {
                    console.error('Ride API returned an error:', result);
                    alert('Ride request failed: ' + result.Error);
                    return;
                }

                if (!result || !result.Unicorn) {
                    console.error('Unexpected API response:', result);
                    alert(
                        'The API responded, but the unicorn details are missing. ' +
                        'Check the Console and API Gateway response.'
                    );
                    return;
                }

                completeRequest(result);
            },

            error: function ajaxError(jqXHR, textStatus, errorThrown) {
                console.error('HTTP Status:', jqXHR.status);
                console.error('Text Status:', textStatus);
                console.error('Error Details:', errorThrown);
                console.error('Response Headers:', jqXHR.getAllResponseHeaders());
                console.error('Response Body:', jqXHR.responseText);

                if (jqXHR.status === 0) {
                    alert(
                        'The request failed or the browser could not read the response. ' +
                        'Check the Console for CORS or network errors.'
                    );
                    return;
                }

                var message = 'Ride request failed. HTTP Status: ' + jqXHR.status;

                if (jqXHR.responseJSON && jqXHR.responseJSON.message) {
                    message += '\n' + jqXHR.responseJSON.message;
                } else if (jqXHR.responseJSON && jqXHR.responseJSON.Error) {
                    message += '\n' + jqXHR.responseJSON.Error;
                } else if (jqXHR.responseText) {
                    message += '\n' + jqXHR.responseText;
                } else {
                    message += '\n' + (errorThrown || textStatus || 'Unknown error');
                }

                alert(message);
            }
        });
    }

    // Handle a successful ride request
    function completeRequest(result) {
        var unicorn = result.Unicorn;

        if (!unicorn) {
            console.error('Unicorn information is missing:', result);
            return;
        }

        var pronoun = unicorn.Gender === 'Male' ? 'his' : 'her';

        displayUpdate(
            unicorn.Name + ', your ' + unicorn.Color +
            ' unicorn, is on ' + pronoun + ' way.'
        );

        animateArrival(function animateCallback() {
            displayUpdate(unicorn.Name + ' has arrived. Giddy up!');

            WildRydes.map.unsetLocation();

            $('#request')
                .prop('disabled', true)
                .text('Set Pickup');
        });
    }

    // Register event handlers when the page loads
    $(function onDocReady() {
        $('#request').on('click', handleRequestClick);

        $(WildRydes.map).on('pickupChange', handlePickupChanged);

        WildRydes.authToken
            .then(function updateAuthMessage(token) {
                if (token) {
                    displayUpdate(
                        'You are authenticated. Click to see your ' +
                        '<a href="#authTokenModal" data-toggle="modal">auth token</a>.'
                    );

                    $('.authToken').text(token);
                }
            })
            .catch(function (error) {
                console.error('Could not update authentication message:', error);
            });

        if (!_config.api || !_config.api.invokeUrl) {
            $('#noApiMessage').show();
        }
    });

    // Enable the request button after selecting a pickup location
    function handlePickupChanged() {
        $('#request')
            .text('Request Unicorn')
            .prop('disabled', false);
    }

    // Handle the Request Unicorn button click
    function handleRequestClick(event) {
        event.preventDefault();

        var pickupLocation = WildRydes.map.selectedPoint;

        if (!pickupLocation) {
            alert('Please click the map to select a pickup location.');
            return;
        }

        requestUnicorn(pickupLocation);
    }

    // Animate the unicorn's arrival on the map
    function animateArrival(callback) {
        var dest = WildRydes.map.selectedPoint;
        var origin = {};

        if (!dest) {
            console.error('Pickup destination is missing.');
            return;
        }

        if (dest.latitude > WildRydes.map.center.latitude) {
            origin.latitude = WildRydes.map.extent.minLat;
        } else {
            origin.latitude = WildRydes.map.extent.maxLat;
        }

        if (dest.longitude > WildRydes.map.center.longitude) {
            origin.longitude = WildRydes.map.extent.minLng;
        } else {
            origin.longitude = WildRydes.map.extent.maxLng;
        }

        WildRydes.map.animate(origin, dest, callback);
    }

    // Add an update message to the page
    function displayUpdate(text) {
        $('#updates').append($('<li>').html(text));
    }
}(jQuery));
