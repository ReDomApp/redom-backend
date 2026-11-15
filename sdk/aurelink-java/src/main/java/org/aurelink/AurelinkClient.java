package org.aurelink;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/** Minimal, dependency-light Aurelink API client for Java 11+. */
public final class AurelinkClient {
  private static final String DEFAULT_BASE_URL = "https://redom-backend.onrender.com/redom-backend/v1";
  private final String apiKey;
  private final String baseUrl;
  private final String workspaceId;
  private final HttpClient http;
  private final ObjectMapper json = new ObjectMapper();

  public AurelinkClient(String apiKey) { this(apiKey, DEFAULT_BASE_URL, null); }
  public AurelinkClient(String apiKey, String baseUrl) { this(apiKey, baseUrl, null); }
  public AurelinkClient(String apiKey, String baseUrl, String workspaceId) {
    if (apiKey == null || apiKey.trim().isEmpty()) throw new IllegalArgumentException("Aurelink API key is required.");
    this.apiKey = apiKey.trim();
    this.baseUrl = (baseUrl == null ? DEFAULT_BASE_URL : baseUrl).replaceAll("/+$", "");
    this.workspaceId = workspaceId;
    this.http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).followRedirects(HttpClient.Redirect.NEVER).build();
  }

  public Map<String,Object> request(String method, String path, Map<String,?> body, String idempotencyKey) throws IOException, InterruptedException {
    String normalizedPath = path.startsWith("/") ? path : "/" + path;
    HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(baseUrl + normalizedPath))
      .timeout(Duration.ofSeconds(25))
      .header("Accept", "application/json")
      .header("Authorization", "Bearer " + apiKey);
    if (workspaceId != null && !workspaceId.trim().isEmpty()) builder.header("X-Aurelink-Workspace-Id", workspaceId.trim());
    if (idempotencyKey != null && !idempotencyKey.isEmpty()) builder.header("Idempotency-Key", idempotencyKey);
    if (body != null) {
      builder.header("Content-Type", "application/json");
      builder.method(method, HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)));
    } else {
      builder.method(method, HttpRequest.BodyPublishers.noBody());
    }
    HttpResponse<String> response = http.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    Map<String,Object> payload;
    try { payload = json.readValue(response.body(), new TypeReference<Map<String,Object>>() {}); }
    catch (Exception parseError) { payload = new LinkedHashMap<>(); payload.put("raw", response.body()); }
    if (response.statusCode() < 200 || response.statusCode() >= 300 || Boolean.FALSE.equals(payload.get("success"))) {
      throw new AurelinkException(String.valueOf(payload.getOrDefault("message", "Aurelink API request failed.")), response.statusCode(), payload);
    }
    return payload;
  }

  public Map<String,Object> sendSms(Map<String,?> payload, String idempotencyKey) throws IOException, InterruptedException {
    return request("POST", "/aurelink/communications/sms/send", payload, idempotencyKey);
  }
  public Map<String,Object> sendEmail(Map<String,?> payload, String idempotencyKey) throws IOException, InterruptedException {
    return request("POST", "/aurelink/communications/email/send", payload, idempotencyKey);
  }
  public Map<String,Object> listMessages() throws IOException, InterruptedException {
    return request("GET", "/aurelink/communications/messages", null, null);
  }
  public Map<String,Object> listDomains() throws IOException, InterruptedException {
    return request("GET", "/aurelink/communications/domains", null, null);
  }
  public Map<String,Object> createDomain(Map<String,?> payload) throws IOException, InterruptedException {
    return request("POST", "/aurelink/communications/domains", payload, null);
  }
  public Map<String,Object> billingOverview() throws IOException, InterruptedException {
    return request("GET", "/aurelink/communications/billing/overview", null, null);
  }
  public Map<String,Object> usage(int limit) throws IOException, InterruptedException {
    return request("GET", "/aurelink/communications/billing/usage?limit=" + Math.max(1, Math.min(100, limit)), null, null);
  }
  public Map<String,Object> reputation() throws IOException, InterruptedException {
    return request("GET", "/aurelink/communications/reputation", null, null);
  }
  public Map<String,Object> inviteMember(String email, String role) throws IOException, InterruptedException {
    Map<String,Object> body = new LinkedHashMap<>(); body.put("email", email); body.put("role", role);
    return request("POST", "/aurelink/communications/team/invitations", body, null);
  }
  public Map<String,Object> acceptInvitation(String token) throws IOException, InterruptedException {
    Map<String,Object> body = new LinkedHashMap<>(); body.put("token", token);
    return request("POST", "/aurelink/communications/team/invitations/accept", body, null);
  }
  public Map<String,Object> suspendDomain(String id, String reason) throws IOException, InterruptedException {
    Map<String,Object> body = new LinkedHashMap<>(); body.put("reason", reason);
    return request("POST", "/aurelink/communications/domains/" + id + "/suspend", body, null);
  }
  public Map<String,Object> resumeDomain(String id) throws IOException, InterruptedException {
    return request("POST", "/aurelink/communications/domains/" + id + "/resume", null, null);
  }
  public Map<String,Object> deleteDomain(String id) throws IOException, InterruptedException {
    return request("DELETE", "/aurelink/communications/domains/" + id, null, null);
  }
  public Map<String,Object> configureTrackingDomain(String id, String trackingDomain) throws IOException, InterruptedException {
    Map<String,Object> body = new LinkedHashMap<>(); body.put("trackingDomain", trackingDomain);
    return request("PUT", "/aurelink/communications/domains/" + id + "/tracking-domain", body, null);
  }
  public Map<String,Object> verifyTrackingDomain(String id) throws IOException, InterruptedException {
    return request("POST", "/aurelink/communications/domains/" + id + "/tracking-domain/verify", null, null);
  }
  public Map<String,Object> billingStatement(String month) throws IOException, InterruptedException {
    return request("GET", "/aurelink/communications/billing/statement?month=" + month, null, null);
  }
  public Map<String,Object> teamMembers() throws IOException, InterruptedException {
    return request("GET", "/aurelink/communications/team/members", null, null);
  }
  public Map<String,Object> changeMemberRole(String memberId, String role) throws IOException, InterruptedException {
    Map<String,Object> body = new LinkedHashMap<>(); body.put("role", role);
    return request("PATCH", "/aurelink/communications/team/members/" + memberId + "/role", body, null);
  }
  public Map<String,Object> revokeMember(String memberId) throws IOException, InterruptedException {
    return request("DELETE", "/aurelink/communications/team/members/" + memberId, null, null);
  }
  public Map<String,Object> acknowledgeReputationAlert(String alertId) throws IOException, InterruptedException {
    return request("POST", "/aurelink/communications/reputation/alerts/" + alertId + "/acknowledge", null, null);
  }
  public static String newIdempotencyKey() { return UUID.randomUUID().toString(); }
}
