package local.bms.web;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import local.bms.security.JwtService;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;

@RestController
@RequestMapping("/campaigns")
@Validated
public class CampaignController {
  private final JdbcTemplate jdbc;
  private final AuthHelper authHelper;
  private final RabbitTemplate rabbit;
  private final String queueSend;

  public CampaignController(
      JdbcTemplate jdbc,
      AuthHelper authHelper,
      RabbitTemplate rabbit,
      @Value("${bms.queue-send}") String queueSend) {
    this.jdbc = jdbc;
    this.authHelper = authHelper;
    this.rabbit = rabbit;
    this.queueSend = queueSend;
  }

  public record CreateCampaign(
      @NotBlank String name,
      @NotBlank String subject,
      @NotBlank String htmlBody,
      String textBody,
      @Email String fromEmail,
      String replyTo,
      UUID listId) {}

  @GetMapping
  public Map<String, Object> list(HttpServletRequest req) {
    authHelper.requireUser(req);
    var campaigns = jdbc.queryForList(
        """
        SELECT c.*,
          (SELECT COUNT(*) FROM messages m WHERE m.campaign_id=c.id) AS message_count,
          (SELECT COUNT(*) FROM messages m WHERE m.campaign_id=c.id AND m.status IN ('sent','delivered')) AS sent_count
        FROM campaigns c ORDER BY c.created_at DESC LIMIT 100
        """);
    return Map.of("campaigns", campaigns);
  }

  @PostMapping
  public Map<String, Object> create(HttpServletRequest req, @RequestBody CreateCampaign body) {
    var claims = authHelper.requireUser(req);
    UUID userId = UUID.fromString(claims.getSubject());
    UUID id = jdbc.queryForObject(
        """
        INSERT INTO campaigns (name, subject, html_body, text_body, from_email, reply_to, list_id, created_by, status)
        VALUES (?,?,?,?,?,?,?,?,'draft') RETURNING id
        """,
        UUID.class,
        body.name(),
        body.subject(),
        body.htmlBody(),
        body.textBody(),
        body.fromEmail(),
        body.replyTo(),
        body.listId(),
        userId);
    var campaign = jdbc.queryForMap("SELECT * FROM campaigns WHERE id=?", id);
    return Map.of("campaign", campaign);
  }

  @GetMapping("/{id}")
  public Map<String, Object> get(HttpServletRequest req, @PathVariable UUID id) {
    authHelper.requireUser(req);
    var rows = jdbc.queryForList("SELECT * FROM campaigns WHERE id=?", id);
    if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "not found");
    var stats = jdbc.queryForList(
        "SELECT status, COUNT(*)::int AS count FROM messages WHERE campaign_id=? GROUP BY status", id);
    return Map.of("campaign", rows.get(0), "stats", stats);
  }

  @PostMapping("/{id}/send")
  public Map<String, Object> send(HttpServletRequest req, @PathVariable UUID id) {
    authHelper.requireUser(req);
    var camps = jdbc.queryForList("SELECT * FROM campaigns WHERE id=?", id);
    if (camps.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "campaign not found");
    var campaign = camps.get(0);
    String status = String.valueOf(campaign.get("status"));
    if (!List.of("draft", "scheduled", "paused").contains(status)) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "status=" + status + " では送信開始できません");
    }

    Object listId = campaign.get("list_id");
    List<Map<String, Object>> recipients =
        listId == null
            ? jdbc.queryForList(
                "SELECT id, email, name FROM recipients WHERE unsubscribed_at IS NULL AND suppressed_at IS NULL")
            : jdbc.queryForList(
                "SELECT id, email, name FROM recipients WHERE unsubscribed_at IS NULL AND suppressed_at IS NULL AND list_id=?",
                listId);

    if (recipients.isEmpty()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "送信可能な受信者がいません");
    }

    jdbc.update("UPDATE campaigns SET status='sending', started_at=now(), updated_at=now() WHERE id=?", id);

    int enqueued = 0;
    for (var r : recipients) {
      UUID messageId =
          jdbc.query(
              """
              INSERT INTO messages (campaign_id, recipient_id, to_email, status)
              VALUES (?,?,?,'queued')
              ON CONFLICT (campaign_id, recipient_id) DO NOTHING
              RETURNING id
              """,
              rs -> rs.next() ? (UUID) rs.getObject(1) : null,
              id,
              r.get("id"),
              r.get("email"));
      if (messageId == null) continue;

      Map<String, Object> job = new LinkedHashMap<>();
      job.put("messageId", messageId.toString());
      job.put("campaignId", id.toString());
      job.put("toEmail", r.get("email"));
      job.put("toName", r.get("name"));
      job.put("subject", campaign.get("subject"));
      job.put("htmlBody", campaign.get("html_body"));
      job.put("textBody", campaign.get("text_body"));
      job.put("fromEmail", campaign.get("from_email"));
      job.put("replyTo", campaign.get("reply_to"));
      job.put("unsubscribeUrl", "http://localhost:3000/unsubscribe?token=pending");
      job.put("trackingPixelUrl", "http://localhost:8090/t/open/" + messageId + ".gif");

      rabbit.convertAndSend(queueSend, job);
      jdbc.update(
          "INSERT INTO delivery_events (message_id, campaign_id, event_type, payload) VALUES (?,?, 'queued', ?::jsonb)",
          messageId,
          id,
          "{\"source\":\"api-java\"}");
      enqueued++;
    }

    jdbc.update("UPDATE campaigns SET status='queued', updated_at=now() WHERE id=?", id);
    return Map.of("ok", true, "enqueued", enqueued, "provider", "spring-boot");
  }
}
