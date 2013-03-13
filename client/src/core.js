/* Crypton Client, Copyright 2013 SpiderOak, Inc.
 *
 * This file is part of Crypton Client.
 *
 * Crypton Client is free software: you can redistribute it and/or modify it
 * under the terms of the Affero GNU General Public License as published by the
 * Free Software Foundation, either version 3 of the License, or (at your
 * option) any later version.
 *
 * Crypton Client is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
 * or FITNESS FOR A PARTICULAR PURPOSE.  See the Affero GNU General Public
 * License for more details.
 *
 * You should have received a copy of the Affero GNU General Public License
 * along with Crypton Client.  If not, see <http://www.gnu.org/licenses/>.
*/
var crypton = {};

(function () {
  crypton.version = '0.0.1';
  crypton.host = 'localhost';
  crypton.port = '2013';

  crypton.url = function () {
    // TODO HTTPS
    return 'http://' + crypton.host + ':' + crypton.port;
  };

  function randomBytes (nbytes) {
    return sjcl.random.randomWords(nbytes);
  }
  crypton.randomBytes = randomBytes;

  crypton.generateAccount = function (username, passphrase, step, callback, options) {
    options = options || {};

    var defaults = {
      keypairBits: 2048,
      keypairCurve: 384,
      save: false, // true
      debug: false
    };

    for (var param in defaults) {
      options[param] = options.hasOwnProperty(param) ? options[param] : defaults[param];
    }

    var account = new crypton.Account();
    account.username = username;

    var containerNameHmacKey = randomBytes(8);
    var symkey = randomBytes(8);
    var hmacKey = randomBytes(8);

    if (options.debug) { 
        console.log("generateAccount 2"); 
    }

    step();

    var keypairBits = options.keypairBits;
    var keypairCurve = options.keypairCurve;
    var start = +new Date();
    var keypair = sjcl.ecc.elGamal.generateKeys(keypairCurve, 0);

    if (options.debug) {
        console.log("generateAccount 4");
    }

    //account.pubKey = hex2b64(keypair.n.toString(16));
    account.pubKey = keypair.pub.serialize();
    account.symkeyCiphertext = sjcl.encrypt(keypair.pub, symkey);

    step();

    account.challengeKey = sjcl.misc.cachedPbkdf2(passphrase, account.challengeKeySalt);

    step();

    if (options.debug) {
      console.log("generateAccount 5");
    }

    var keypairKey = sjcl.misc.cachedPbkdf2(passphrase, account.keypairSalt);

    step();

    if (options.debug) {
      console.log("generateAccount 6");
    }

    account.keypairCiphertext = sjcl.encrypt(keypairKey.key, JSON.stringify(keypair.sec.serialize())); // need whole keypair

    if (options.debug) {
      console.log("generateAccount 7");
    }

    step();

    account.containerNameHmacKeyCiphertext = sjcl.encrypt(symkey, containerNameHmacKey);

    if (options.debug) {
      console.log("generateAccount 8");
    }

    step();

    account.hmacKeyCiphertext = sjcl.encrypt(symkey, hmacKey);

    if (options.debug) {
      console.log("generateAccount 9");
    }

    if (options.save) {
      account.save(function (err) {
        callback(err, account);
      });
      return;
    }

    callback(null, account);

    if (options.debug) {
      console.log("generateAccount end");
    }
  };

  crypton.authorize = function (username, passphrase, callback) {
    superagent.post(crypton.url() + '/account/' + username)
      .end(function (res) {
        if (!res.body || res.body.success !== true) {
          callback(res.body.error);
          return;
        }

        var body = res.body;
        var iv = CryptoJS.enc.Hex.parse(body.iv);
        var challengeKeySalt = CryptoJS.enc.Hex.parse(body.challengeKeySalt);
        var challengeKey = CryptoJS.PBKDF2(passphrase, challengeKeySalt, {
          keySize: 256 / 32,
          // iterations: 1000
        });

        var encrypted = CryptoJS.lib.CipherParams.create({
          ciphertext: CryptoJS.enc.Hex.parse(body.challenge),
          salt: challengeKeySalt,
          iv: iv
        });

        var challenge = CryptoJS.AES.decrypt(
          encrypted, challengeKey, {
            iv: iv,
            mode: CryptoJS.mode.CFB,
            padding: CryptoJS.pad.NoPadding
          }
        );

        var timeValueDigest = CryptoJS.SHA256(body.time);
        var timeValueCiphertext = CryptoJS.AES.encrypt(
          timeValueDigest, challenge, {
            iv: iv,
            mode: CryptoJS.mode.CFB,
            padding: CryptoJS.pad.NoPadding
          }
        ).ciphertext.toString();

        var response = {
          challengeId: body.challengeId,
          answer: timeValueCiphertext
        };

        superagent.post(crypton.url() + '/account/' + username + '/answer')
          .send(response)
          .end(function (res) {
            if (!res.body || res.body.success !== true) {
              callback(res.body.error);
              return;
            }

            var sessionIdentifier = res.body.sessionIdentifier;
            var session = new crypton.Session(sessionIdentifier);
            session.account = new crypton.Account();
            session.account.passphrase = passphrase;
            for (var i in res.body.account) {
              session.account[i] = res.body.account[i];
            }

            session.account.unravel(function () {
              callback(null, session);
            });
          });
      }
    );
  };

  crypton.resurrect = function () {

  };
})();

