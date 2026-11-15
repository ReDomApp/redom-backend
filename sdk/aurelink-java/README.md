# Aurelink Java SDK

Official Java 11+ client for the Aurelink developer API.

## Install

Build the SDK locally with Maven:

```bash
mvn -q -DskipTests package
```

Add the published Maven coordinate when Aurelink releases this package to a Maven repository. This repository package is not yet published.

## Quick start

```java
import org.aurelink.AurelinkClient;
import java.util.Map;

AurelinkClient client = new AurelinkClient(System.getenv("AURELINK_API_KEY"));
Map<String, Object> result = client.sendSms(
    Map.of(
        "recipient", "+15555550100",
        "sender", "AURELINK",
        "countryCode", "US",
        "content", "Your verification code is 123456.",
        "category", "transactional"
    ),
    AurelinkClient.newIdempotencyKey()
);
```

## Included methods

- SMS and email sending
- Message listing
- Sending-domain listing and creation
- Billing overview and usage retrieval
- Reputation overview
- Workspace invitations and invitation acceptance
- Generic authenticated request method for other API endpoints

The SDK does not bypass Aurelink authentication, workspace permissions, sender approval, domain verification, pricing configuration, or provider delivery constraints. Use test API keys for sandbox requests. Store API keys in environment variables or a secrets manager.

## Errors

Non-success HTTP responses throw `AurelinkException`, which exposes the HTTP status and parsed response body.
