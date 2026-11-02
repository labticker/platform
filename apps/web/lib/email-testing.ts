/** A second UI/action gate; the queue independently verifies the owner identity. */
export function privateEmailTestVisible(env:Record<string,string|undefined>,user:{role:string}|null):boolean{
 return env.EMAIL_TEST_ENABLED==='true'&&env.OWNER_ACCEPTANCE_ONLY==='true'&&env.EMAIL_DELIVERY_MODE==='mock'&&user?.role==='admin';
}
const messages:Record<string,string>={
 queued:'Your test digest is queued for your verified account email. This confirms queueing, not delivery; refresh this page to check delivery status.',
 'already-queued':'This test request is already queued. A duplicate email was not requested.',
 'rate-limited':'The private test email limit has been reached. Wait before requesting another test.',
 'no-releases':'No stored releases are available for your monitored applications. Choose applications with release history and try again.',
 blocked:'The private test is blocked by the email test safety checks. Review the owner configuration.',
 disabled:'Private email testing is disabled.',
 suppressed:'Your account is suppressed from email delivery. A test cannot bypass that preference.',
 consent:'Check the separate test-send consent box to request a real email.',
 unavailable:'The test digest could not be queued. Check the private email test configuration and try again.',
};
export function emailTestMessage(status:unknown):string|undefined{
 return typeof status==='string'&&Object.hasOwn(messages,status)?messages[status]:undefined;
}
