/*
 * Sendpulse REST API Node.js class
 *
 * Documentation
 * https://login.sendpulse.com/manual/rest-api/
 * https://sendpulse.com/api
 *
 */

/* eslint-disable strict */

'use strict';

const request = require('request-promise');
const debug = require('debug')('sendpulse');

const API_URL = 'api.sendpulse.com';

/**
 * Basse64
 *
 * @param data
 * @return string
 */
function base64(data) {
  return Buffer.from(data).toString('base64');
}

/**
 * Sendpulse API initialization
 *
 * @param userId
 * @param secret
 * @param storage
 */
function SendPulse(userId, secret) {
  this.API_USER_ID = userId;
  this.API_SECRET = secret;
  this.TOKEN = null;
  this.pendingRequests = [];
  this.getToken();
}

/**
 * Form and send request to API service
 *
 * @param path
 * @param method
 * @param data
 * @param useToken
 * @param callback
 *        Define the function  that will be called
 *        when a response is received.
 */
function sendRequest(path, _method, data, _useToken, callback) {
  debug('send request:', path, _method, data, _useToken);
  const headers = {};

  const useToken = _useToken || false;
  const method = _method || 'POST';

  if (useToken && this.TOKEN) {
    headers.authorization = `Bearer ${this.TOKEN}`;
  } else if (useToken && !this.TOKEN) {
    debug('no token yet - queue', path, method, data, useToken);
    this.pendingRequests.push([path, method, data, useToken, callback]);
    return;
  }

  const opts = {
    url: `https://${API_URL}/${path}`,
    headers,
    method,
    json: true,
    body: data,
    transform2xxOnly: true,
    resolveWithFullResponse: true,
  };

  debug('sending %j', opts);

  request(opts)
    .then((response) => {
      if (response.statusCode === 401) {
        debug('response 401, queueing');
        this.TOKEN = null;
        this.getToken();
        this.sendRequest(path, method, data, true, callback);
        return null;
      }

      if (/^2[0-9]{2}$/.test(response.statusCode)) {
        callback(response.body);
        return null;
      }

      debug(response.statusCode, response.body);
      callback(this.returnError(response.body, data));
      return null;
    })
    .catch((e) => {
      debug(e);
      callback(this.returnError(e.message, data));
    });
}

/**
 * Get token and store it
 *
 */
function getToken() {
  debug('trying to get token');
  if (this.TOKEN === false) return;
  debug('enqueue token request');
  this.TOKEN = false;

  const data = {
    grant_type: 'client_credentials',
    client_id: this.API_USER_ID,
    client_secret: this.API_SECRET,
  };

  this.sendRequest('oauth/access_token', 'POST', data, false, (response) => {
    debug('token response', response);
    this.TOKEN = response.access_token;

    // clear the loop
    if (this.pendingRequests.length > 0) {
      // eslint-disable-next-line prefer-spread
      this.pendingRequests.forEach(args => this.sendRequest.apply(this, args));
      this.pendingRequests = [];
    }
  });
}

/**
 * Form error object
 *
 *  @return array
 */
function returnError(message, postData) {
  const data = { is_error: 1 };
  if (message) {
    data.message = message;
  }

  if (postData) {
    data.postData = postData;
  }

  return data;
}

function _utf8Size(str) {
  let size = 0;
  let i = 0;
  let code = '';
  const l = str.length;
  for (i = 0; i < l; i += 1) {
    code = str.charCodeAt(i);
    if (code < 0x0080) {
      size += 1;
    } else if (code < 0x0800) {
      size += 2;
    } else {
      size += 3;
    }
  }
  return size;
}

function _getType(inp) {
  const type = typeof inp;

  if (type === 'object' && !inp) {
    return 'null';
  }

  if (type === 'object') {
    if (!inp.constructor) {
      return 'object';
    }

    let cons = inp.constructor.toString();
    const match = cons.match(/(\w+)\(/);
    if (match) {
      cons = match[1].toLowerCase();
    }

    const types = {
      boolean: true,
      number: true,
      string: true,
      array: true,
    };

    if (types[cons] === true) {
      return cons;
    }
  }

  return type;
}

/**
 * Serializing of the array
 *
 * @param mixedValue
 * @return string
 */
function serialize(mixedValue) {
  let val;
  let okey;
  let vals = '';
  let count = 0;

  const type = _getType(mixedValue);

  switch (type) {
    case 'function':
      val = '';
      break;
    case 'boolean':
      val = `b:${mixedValue ? '1' : '0'}`;
      break;
    case 'number':
      val = `${Math.round(mixedValue) === mixedValue ? 'i' : 'd'}:${mixedValue}`;
      break;
    case 'string':
      val = `s:${_utf8Size(mixedValue)}:"${mixedValue}"`;
      break;
    case 'array':
    case 'object':
      val = 'a';
      Object.keys(mixedValue).forEach((key) => {
        const ktype = _getType(mixedValue[key]);
        if (ktype === 'function') {
          return;
        }

        okey = (key.match(/^[0-9]+$/) ? parseInt(key, 10) : key);
        vals += serialize(okey) + serialize(mixedValue[key]);
        count += 1;
      });
      val += `:${count}:{${vals}}`;
      break;
    case 'undefined':
    default:
      val = 'N';
      break;
  }
  if (type !== 'object' && type !== 'array') {
    val += ';';
  }
  return val;
}

/**
 * API interface implementation
 */

/**
 * Get list of address books
 *
 * @param callback
 * @param limit
 * @param offset
 */
function listAddressBooks(callback, limit, offset) {
  const data = {};
  if (limit) data.limit = limit;
  if (offset) data.offset = offset;

  this.sendRequest('addressbooks', 'GET', data, true, callback);
}

/**
 * Create address book
 *
 * @param callback
 * @param bookName
 */
function createAddressBook(callback, bookName) {
  if ((bookName === undefined) || (!bookName.length)) {
    callback(returnError('Empty book name'));
    return;
  }
  const data = { bookName };
  this.sendRequest('addressbooks', 'POST', data, true, callback);
}

/**
 * Edit address book name
 *
 * @param callback
 * @param id
 * @param bookName
 */
function editAddressBook(callback, id, bookName) {
  if ((id === undefined) || (bookName === undefined) || (!bookName.length)) {
    callback(returnError('Empty book name or book id'));
    return;
  }
  const data = { name: bookName };
  this.sendRequest(`addressbooks/${id}`, 'PUT', data, true, callback);
}

/**
 * Remove address book
 *
 * @param callback
 * @param id
 */
function removeAddressBook(callback, id) {
  if (id === undefined) {
    callback(returnError('Empty book id'));
    return;
  }
  this.sendRequest(`addressbooks/${id}`, 'DELETE', {}, true, callback);
}

/**
 * Get information about book
 *
 * @param callback
 * @param id
 */
function getBookInfo(callback, id) {
  if (id === undefined) {
    callback(returnError('Empty book id'));
    return;
  }
  this.sendRequest(`addressbooks/${id}`, 'GET', {}, true, callback);
}

/**
 * List email addresses from book
 *
 * @param callback
 * @param id
 */
function getEmailsFromBook(callback, id) {
  if (id === undefined) {
    callback(returnError('Empty book id'));
    return;
  }
  this.sendRequest(`addressbooks/${id}/emails`, 'GET', {}, true, callback);
}

/**
 * Add new emails to address book
 *
 * @param callback
 * @param id
 * @param emails
 */
function addEmails(callback, id, emails) {
  if ((id === undefined) || (emails === undefined) || (!emails.length)) {
    callback(returnError('Empty email or book id'));
    return;
  }
  const data = { emails: serialize(emails) };
  this.sendRequest(`addressbooks/${id}/emails`, 'POST', data, true, callback);
}

/**
 * Remove email addresses from book
 *
 * @param callback
 * @param id
 * @param emails
 */
function removeEmails(callback, id, emails) {
  if ((id === undefined) || (emails === undefined) || (!emails.length)) {
    callback(returnError('Empty email or book id'));
    return;
  }
  const data = { emails: serialize(emails) };
  this.sendRequest(`addressbooks/${id}/emails`, 'DELETE', data, true, callback);
}

/**
 * Get information about email address from book
 *
 * @param callback
 * @param id
 * @param email
 */
function getEmailInfo(callback, id, email) {
  if ((id === undefined) || (email === undefined) || (!email.length)) {
    callback(returnError('Empty email or book id'));
    return;
  }
  this.sendRequest(`addressbooks/${id}/emails/${email}`, 'GET', {}, true, callback);
}

/**
 * Get cost of campaign based on address book
 *
 * @param callback
 * @param id
 */
function campaignCost(callback, id) {
  if (id === undefined) {
    callback(returnError('Empty book id'));
    return;
  }
  this.sendRequest(`addressbooks/${id}/cost`, 'GET', {}, true, callback);
}

/**
 * Get list of campaigns
 *
 * @param callback
 * @param limit
 * @param offset
 */
function listCampaigns(callback, limit, offset) {
  const data = {};
  if (limit) data.limit = limit;
  if (offset) data.offset = offset;

  this.sendRequest('campaigns', 'GET', data, true, callback);
}

/**
 * Get information about campaign
 *
 * @param callback
 * @param id
 */
function getCampaignInfo(callback, id) {
  if (id === undefined) {
    callback(returnError('Empty book id'));
    return;
  }
  this.sendRequest(`campaigns/${id}`, 'GET', {}, true, callback);
}

/**
 * Get campaign statistic by countries
 *
 * @param callback
 * @param id
 */
function campaignStatByCountries(callback, id) {
  if (id === undefined) {
    callback(returnError('Empty book id'));
    return;
  }
  this.sendRequest(`campaigns/${id}/countries`, 'GET', {}, true, callback);
}

/**
 * Get campaign statistic by referrals
 *
 * @param callback
 * @param id
 */
function campaignStatByReferrals(callback, id) {
  if (id === undefined) {
    callback(returnError('Empty book id'));
    return;
  }
  this.sendRequest(`campaigns/${id}/referrals`, 'GET', {}, true, callback);
}

/**
 * Create new campaign
 *
 * @param callback
 * @param senderName
 * @param senderEmail
 * @param subject
 * @param body
 * @param bookId
 * @param name
 * @param attachments
 */
function createCampaign(callback, senderName, senderEmail, subject, body, bookId, _name, _attachments) {
  if (!senderName || !senderName.length || !senderEmail || !senderEmail.length || !subject || !subject.length || !body || !body.length || !bookId) {
    callback(returnError('Not all data.'));
    return;
  }

  const name = _name || '';
  let attachments = _attachments || '';

  if (attachments.length) {
    attachments = serialize(attachments);
  }

  const data = {
    sender_name: senderName,
    sender_email: senderEmail,
    // subject: encodeURIComponent(subject),
    // subject: urlencode(subject),
    subject,
    body: base64(body),
    list_id: bookId,
    name,
    attachments,
  };
  this.sendRequest('campaigns', 'POST', data, true, callback);
}

/**
 * Cancel campaign
 *
 * @param callback
 * @param id
 */
function cancelCampaign(callback, id) {
  if (id === undefined) {
    callback(returnError('Empty campaign id'));
    return;
  }

  this.sendRequest(`campaigns/${id}`, 'DELETE', {}, true, callback);
}

/**
 * List all senders
 *
 * @param callback
 */
function listSenders(callback) {
  this.sendRequest('senders', 'GET', {}, true, callback);
}

/**
 * Add new sender
 *
 * @param callback
 * @param senderName
 * @param senderEmail
 */
function addSender(callback, senderName, senderEmail) {
  if ((senderEmail === undefined) || (!senderEmail.length) || (senderName === undefined) || (!senderName.length)) {
    callback(returnError('Empty sender name or email'));
    return;
  }
  const data = {
    email: senderEmail,
    name: senderName,
  };
  this.sendRequest('senders', 'POST', data, true, callback);
}

/**
 * Remove sender
 *
 * @param callback
 * @param senderEmail
 */
function removeSender(callback, senderEmail) {
  if ((senderEmail === undefined) || (!senderEmail.length)) {
    callback(returnError('Empty email'));
    return;
  }

  const data = {
    email: senderEmail,
  };
  this.sendRequest('senders', 'DELETE', data, true, callback);
}

/**
 * Activate sender using code
 *
 * @param callback
 * @param senderEmail
 * @param code
 */
function activateSender(callback, senderEmail, code) {
  if ((senderEmail === undefined) || (!senderEmail.length) || (code === undefined) || (!code.length)) {
    callback(returnError('Empty email or activation code'));
    return;
  }
  const data = {
    code,
  };
  this.sendRequest(`senders/${senderEmail}/code`, 'POST', data, true, callback);
}

/**
 * Request mail with activation code
 *
 * @param callback
 * @param senderEmail
 */
function getSenderActivationMail(callback, senderEmail) {
  if ((senderEmail === undefined) || (!senderEmail.length)) {
    callback(returnError('Empty email'));
    return;
  }
  this.sendRequest(`senders/${senderEmail}/code`, 'GET', {}, true, callback);
}

/**
 * Get global information about email
 *
 * @param callback
 * @param email
 */
function getEmailGlobalInfo(callback, email) {
  if ((email === undefined) || (!email.length)) {
    callback(returnError('Empty email'));
    return;
  }
  this.sendRequest(`emails/${email}`, 'GET', {}, true, callback);
}

/**
 * Remove email from all books
 *
 * @param callback
 * @param email
 */
function removeEmailFromAllBooks(callback, email) {
  if ((email === undefined) || (!email.length)) {
    callback(returnError('Empty email'));
    return;
  }
  this.sendRequest(`emails/${email}`, 'DELETE', {}, true, callback);
}

/**
 * Get email statistic by all campaigns
 *
 * @param callback
 * @param email
 */
function emailStatByCampaigns(callback, email) {
  if ((email === undefined) || (!email.length)) {
    callback(returnError('Empty email'));
    return;
  }
  this.sendRequest(`emails/${email}/campaigns`, 'GET', {}, true, callback);
}

/**
 * Get all emails from blacklist
 *
 * @param callback
 */
function getBlackList(callback) {
  this.sendRequest('blacklist', 'GET', {}, true, callback);
}

/**
 * Add email to blacklist
 *
 * @param callback
 * @param emails
 * @param comment
 */
function addToBlackList(callback, emails, _comment) {
  if ((emails === undefined) || (!emails.length)) {
    callback(returnError('Empty email'));
    return;
  }

  const comment = _comment || '';

  const data = {
    emails: base64(emails),
    comment,
  };
  this.sendRequest('blacklist', 'POST', data, true, callback);
}

/**
 * Remove emails from blacklist
 *
 * @param callback
 * @param emails
 */
function removeFromBlackList(callback, emails) {
  if ((emails === undefined) || (!emails.length)) {
    callback(returnError('Empty emails'));
    return;
  }

  const data = {
    emails: base64(emails),
  };
  this.sendRequest('blacklist', 'DELETE', data, true, callback);
}

/**
 * Get balance
 *
 * @param callback
 * @param currency
 */
function getBalance(callback, currency) {
  const url = currency === undefined
    ? 'balance'
    : `balance/${currency.toUpperCase()}`;

  this.sendRequest(url, 'GET', {}, true, callback);
}

/**
 * SMTP: get list of emails
 *
 * @param callback
 * @param limit
 * @param offset
 * @param fromDate
 * @param toDate
 * @param sender
 * @param recipient
 */
function smtpListEmails(callback, _limit, _offset, _fromDate, _toDate, _sender, _recipient) {
  const limit = _limit || 0;
  const offset = _offset || 0;
  const fromDate = _fromDate || '';
  const toDate = _toDate || '';
  const sender = _sender || '';
  const recipient = _recipient || '';

  const data = {
    limit,
    offset,
    from: fromDate,
    to: toDate,
    sender,
    recipient,
  };

  this.sendRequest('smtp/emails', 'GET', data, true, callback);
}

/**
 * Get information about email by id
 *
 * @param callback
 * @param id
 */
function smtpGetEmailInfoById(callback, id) {
  if ((id === undefined) || (!id.length)) {
    callback(returnError('Empty id'));
    return;
  }
  this.sendRequest(`smtp/emails/${id}`, 'GET', {}, true, callback);
}

/**
 * SMTP: add emails to unsubscribe list
 *
 * @param callback
 * @param emails
 */
function smtpUnsubscribeEmails(callback, emails) {
  if (emails === undefined) {
    callback(returnError('Empty emails'));
    return;
  }

  const data = {
    emails: serialize(emails),
  };
  this.sendRequest('smtp/unsubscribe', 'POST', data, true, callback);
}

/**
 * SMTP: remove emails from unsubscribe list
 *
 * @param callback
 * @param emails
 */
function smtpRemoveFromUnsubscribe(callback, emails) {
  if (emails === undefined) {
    callback(returnError('Empty emails'));
    return;
  }

  const data = {
    emails: serialize(emails),
  };
  this.sendRequest('smtp/unsubscribe', 'DELETE', data, true, callback);
}

/**
 * Get list of IP
 *
 * @param callback
 */
function smtpListIP(callback) {
  this.sendRequest('smtp/ips', 'GET', {}, true, callback);
}

/**
 * SMTP: get list of allowed domains
 *
 * @param callback
 */
function smtpListAllowedDomains(callback) {
  this.sendRequest('smtp/domains', 'GET', {}, true, callback);
}

/**
 * SMTP: add new domain
 *
 * @param callback
 * @param email
 */
function smtpAddDomain(callback, email) {
  if ((email === undefined) || (!email.length)) {
    callback(returnError('Empty email'));
    return;
  }
  const data = {
    email,
  };
  this.sendRequest('smtp/domains', 'POST', data, true, callback);
}

/**
 * SMTP: verify domain
 *
 * @param callback
 * @param email
 */
function smtpVerifyDomain(callback, email) {
  if ((email === undefined) || (!email.length)) {
    callback(returnError('Empty email'));
    return;
  }

  this.sendRequest(`smtp/domains/${email}`, 'GET', {}, true, callback);
}

/**
 * SMTP: send mail
 *
 * @param callback
 * @param email
 */
function smtpSendMail(callback, email) {
  if (email === undefined) {
    callback(returnError('Empty email data'));
    return;
  }

  email.html = base64(email.html);

  const data = {
    email: serialize(email),
  };

  this.sendRequest('smtp/emails', 'POST', data, true, callback);
}

SendPulse.prototype.sendRequest = sendRequest;
SendPulse.prototype.returnError = returnError;
SendPulse.prototype.getToken = getToken;
SendPulse.prototype.listAddressBooks = listAddressBooks;
SendPulse.prototype.createAddressBook = createAddressBook;
SendPulse.prototype.editAddressBook = editAddressBook;
SendPulse.prototype.removeAddressBook = removeAddressBook;
SendPulse.prototype.getBookInfo = getBookInfo;
SendPulse.prototype.getEmailsFromBook = getEmailsFromBook;
SendPulse.prototype.addEmails = addEmails;
SendPulse.prototype.removeEmails = removeEmails;
SendPulse.prototype.getEmailInfo = getEmailInfo;
SendPulse.prototype.campaignCost = campaignCost;
SendPulse.prototype.listCampaigns = listCampaigns;
SendPulse.prototype.getCampaignInfo = getCampaignInfo;
SendPulse.prototype.campaignStatByCountries = campaignStatByCountries;
SendPulse.prototype.campaignStatByReferrals = campaignStatByReferrals;
SendPulse.prototype.createCampaign = createCampaign;
SendPulse.prototype.cancelCampaign = cancelCampaign;
SendPulse.prototype.listSenders = listSenders;
SendPulse.prototype.addSender = addSender;
SendPulse.prototype.removeSender = removeSender;
SendPulse.prototype.activateSender = activateSender;
SendPulse.prototype.getSenderActivationMail = getSenderActivationMail;
SendPulse.prototype.getEmailGlobalInfo = getEmailGlobalInfo;
SendPulse.prototype.removeEmailFromAllBooks = removeEmailFromAllBooks;
SendPulse.prototype.emailStatByCampaigns = emailStatByCampaigns;
SendPulse.prototype.getBlackList = getBlackList;
SendPulse.prototype.addToBlackList = addToBlackList;
SendPulse.prototype.removeFromBlackList = removeFromBlackList;
SendPulse.prototype.getBalance = getBalance;
SendPulse.prototype.smtpListEmails = smtpListEmails;
SendPulse.prototype.smtpGetEmailInfoById = smtpGetEmailInfoById;
SendPulse.prototype.smtpUnsubscribeEmails = smtpUnsubscribeEmails;
SendPulse.prototype.smtpRemoveFromUnsubscribe = smtpRemoveFromUnsubscribe;
SendPulse.prototype.smtpListIP = smtpListIP;
SendPulse.prototype.smtpListAllowedDomains = smtpListAllowedDomains;
SendPulse.prototype.smtpAddDomain = smtpAddDomain;
SendPulse.prototype.smtpVerifyDomain = smtpVerifyDomain;
SendPulse.prototype.smtpSendMail = smtpSendMail;

module.exports = SendPulse;
