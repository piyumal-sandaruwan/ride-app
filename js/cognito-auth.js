
/*global $ _config AmazonCognitoIdentity AWSCognito*/

var WildRydes = window.WildRydes || {};
window.WildRydes = WildRydes;

(function scopeWrapper($) {
    'use strict';

    var signinUrl = '/signin.html';
    var userPool;

    // Validate Cognito configuration.
    if (
        !_config ||
        !_config.cognito ||
        !_config.cognito.userPoolId ||
        !_config.cognito.userPoolClientId ||
        !_config.cognito.region
    ) {
        $('#noCognitoMessage').show();
        console.error('Cognito configuration is missing in js/config.js');
        return;
    }

    var poolData = {
        UserPoolId: _config.cognito.userPoolId,
        ClientId: _config.cognito.userPoolClientId
    };

    userPool = new AmazonCognitoIdentity.CognitoUserPool(poolData);

    if (typeof AWSCognito !== 'undefined') {
        AWSCognito.config.region = _config.cognito.region;
    }

    // Keep the username convention used by your existing Cognito accounts.
    function toUsername(email) {
        return email.trim().toLowerCase().replace('@', '-at-');
    }

    function createCognitoUser(email) {
        return new AmazonCognitoIdentity.CognitoUser({
            Username: toUsername(email),
            Pool: userPool
        });
    }

    function getErrorMessage(err) {
        if (!err) {
            return 'An unexpected error occurred. Please try again.';
        }

        switch (err.code) {
            case 'NotAuthorizedException':
                return 'Incorrect email or password. Please try again.';

            case 'UserNotFoundException':
                return 'No account was found for that email address.';

            case 'UserNotConfirmedException':
                return 'Your account is not verified yet. Please verify your email first.';

            case 'UsernameExistsException':
                return 'An account with these details already exists.';

            case 'InvalidPasswordException':
                return 'Your password does not meet the password requirements.';

            case 'CodeMismatchException':
                return 'The verification code is incorrect.';

            case 'ExpiredCodeException':
                return 'The verification code has expired. Request a new code.';

            case 'PasswordResetRequiredException':
                return 'A password reset is required before you can sign in.';

            case 'NetworkError':
                return 'A network error occurred. Check your connection and try again.';

            default:
                return err.message || 'Authentication failed. Please try again.';
        }
    }

    // Sign out the current Cognito user safely.
    WildRydes.signOut = function signOut() {
        var currentUser = userPool.getCurrentUser();

        if (currentUser) {
            currentUser.signOut();
        }
    };

    // Resolve the current ID token, if the user has a valid session.
    WildRydes.authToken = new Promise(function (resolve, reject) {
        var currentUser = userPool.getCurrentUser();

        if (!currentUser) {
            resolve(null);
            return;
        }

        currentUser.getSession(function (err, session) {
            if (err) {
                reject(err);
                return;
            }

            if (!session || !session.isValid()) {
                resolve(null);
                return;
            }

            resolve(session.getIdToken().getJwtToken());
        });
    });

    // Register a new user.
    function register(email, password, onSuccess, onFailure) {
        var attributeEmail = new AmazonCognitoIdentity.CognitoUserAttribute({
            Name: 'email',
            Value: email
        });

        userPool.signUp(
            toUsername(email),
            password,
            [attributeEmail],
            null,
            function (err, result) {
                if (err) {
                    onFailure(err);
                    return;
                }

                onSuccess(result);
            }
        );
    }

    // Sign in an existing user.
    function signin(email, password, onSuccess, onFailure) {
        var authenticationDetails =
            new AmazonCognitoIdentity.AuthenticationDetails({
                Username: toUsername(email),
                Password: password
            });

        var cognitoUser = createCognitoUser(email);

        cognitoUser.authenticateUser(authenticationDetails, {
            onSuccess: onSuccess,

            onFailure: onFailure,

            newPasswordRequired: function () {
                onFailure({
                    code: 'PasswordResetRequiredException',
                    message: 'A new password is required.'
                });
            }
        });
    }

    // Verify a new user's email confirmation code.
    function verify(email, code, onSuccess, onFailure) {
        createCognitoUser(email).confirmRegistration(
            code.trim(),
            true,
            function (err, result) {
                if (err) {
                    onFailure(err);
                    return;
                }

                onSuccess(result);
            }
        );
    }

    // Attach event handlers after the page loads.
    $(function onDocReady() {
        $('#signinForm').on('submit', handleSignin);
        $('#registrationForm').on('submit', handleRegister);
        $('#verifyForm').on('submit', handleVerify);

        if ($('#signinForm').length) {
            $('#emailInputSignin').trigger('focus');
        }
    });

    function handleSignin(event) {
        event.preventDefault();

        var email = $('#emailInputSignin').val().trim();
        var password = $('#passwordInputSignin').val();
        var $button = $('#signinButton');
        var $message = $('#signinMessage');

        $message.text('');

        if (!email || !password) {
            $message.text('Enter your email and password.');
            return;
        }

        $button.prop('disabled', true).val('Signing in...');

        signin(
            email,
            password,

            function signinSuccess() {
                console.log('Successfully logged in.');

                // The authentication SDK stores the Cognito session.
                window.location.assign('/ride.html');
            },

            function signinError(err) {
                console.error('Cognito sign-in error:', err);

                $message.text(getErrorMessage(err));
                $button.prop('disabled', false).val('Sign In');
            }
        );
    }

    function handleRegister(event) {
        event.preventDefault();

        var email = $('#emailInputRegister').val().trim();
        var password = $('#passwordInputRegister').val();
        var password2 = $('#password2InputRegister').val();

        if (!email || !password || !password2) {
            alert('Please complete all registration fields.');
            return;
        }

        if (password !== password2) {
            alert('Passwords do not match.');
            return;
        }

        register(
            email,
            password,

            function registerSuccess(result) {
                console.log(
                    'Registration successful:',
                    result.user.getUsername()
                );

                alert(
                    'Registration successful. Check your email for the verification code.'
                );

                window.location.assign('/verify.html');
            },

            function registerFailure(err) {
                console.error('Registration error:', err);
                alert(getErrorMessage(err));
            }
        );
    }

    function handleVerify(event) {
        event.preventDefault();

        var email = $('#emailInputVerify').val().trim();
        var code = $('#codeInputVerify').val().trim();

        if (!email || !code) {
            alert('Enter your email and verification code.');
            return;
        }

        verify(
            email,
            code,

            function verifySuccess(result) {
                console.log('Email verification successful:', result);

                alert(
                    'Email verified successfully. You can now sign in.'
                );

                window.location.assign(signinUrl);
            },

            function verifyFailure(err) {
                console.error('Verification error:', err);
                alert(getErrorMessage(err));
            }
        );
    }
}(jQuery));
