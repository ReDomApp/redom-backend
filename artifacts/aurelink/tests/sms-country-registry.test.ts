import test from "node:test";
import assert from "node:assert/strict";
import { AURELINK_SMS_COUNTRIES, getAurelinkSmsCountry, isAurelinkE164ForCountry } from "../../redom-backend/src/services/aurelink/sms-country-registry.ts";

test("Aurelink publishes its supported SMS destinations without Singapore",()=>{
  assert.equal(AURELINK_SMS_COUNTRIES.length,205);
  assert.equal(new Set(AURELINK_SMS_COUNTRIES.map(country=>country.countryCode)).size,AURELINK_SMS_COUNTRIES.length);
  assert.equal(getAurelinkSmsCountry("SG"),undefined);
  assert.ok(AURELINK_SMS_COUNTRIES.every(country=>/^\+[1-9]\d{0,6}$/.test(country.callingCode)));
});

test("Aurelink validates international E.164 prefixes for supported destinations",()=>{
  assert.equal(isAurelinkE164ForCountry("+2348012345678","NG"),true);
  assert.equal(isAurelinkE164ForCountry("+447700900123","GB"),true);
  assert.equal(isAurelinkE164ForCountry("+18095551234","DO"),true);
  assert.equal(isAurelinkE164ForCountry("+18295551234","DO"),true);
  assert.equal(isAurelinkE164ForCountry("+2348012345678","GH"),false);
  assert.equal(isAurelinkE164ForCountry("+6591234567","SG"),false);
  assert.equal(isAurelinkE164ForCountry("08012345678","NG"),false);
});
