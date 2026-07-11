package local.bms.web;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/reputation")
public class ReputationController {
  private final JdbcTemplate jdbc;
  private final AuthHelper authHelper;

  public ReputationController(JdbcTemplate jdbc, AuthHelper authHelper) {
    this.jdbc = jdbc;
    this.authHelper = authHelper;
  }

  @GetMapping
  public Map<String, Object> metrics(HttpServletRequest req, @RequestParam(defaultValue = "24") int windowHours) {
    authHelper.requireUser(req);
    var row =
        jdbc.queryForMap(
            """
            SELECT
              COUNT(*) FILTER (WHERE sent_at IS NOT NULL) AS sent,
              COUNT(*) FILTER (WHERE delivered_at IS NOT NULL OR status = 'delivered') AS delivered,
              COUNT(*) FILTER (WHERE bounced_at IS NOT NULL OR status = 'bounced') AS bounce,
              COUNT(*) FILTER (WHERE complained_at IS NOT NULL OR status = 'complained') AS complaint,
              COUNT(*) FILTER (WHERE opened_at IS NOT NULL) AS opened,
              COUNT(*) FILTER (WHERE clicked_at IS NOT NULL) AS clicked
            FROM messages
            WHERE queued_at >= now() - (? || ' hours')::interval
            """,
            String.valueOf(windowHours));

    double sent = ((Number) row.get("sent")).doubleValue();
    double delivered = ((Number) row.get("delivered")).doubleValue();
    double bounce = ((Number) row.get("bounce")).doubleValue();
    double complaint = ((Number) row.get("complaint")).doubleValue();
    double opened = ((Number) row.get("opened")).doubleValue();
    double clicked = ((Number) row.get("clicked")).doubleValue();
    double denom = Math.max(sent, 1);

    double bounceRate = bounce / denom;
    double complaintRate = complaint / denom;
    double deliveryRate = delivered / denom;
    double openRate = opened / Math.max(delivered, 1);
    double clickRate = clicked / Math.max(delivered, 1);

    double score = 100;
    score -= Math.min(50, bounceRate * 1000);
    score -= Math.min(40, complaintRate * 20000);
    if (deliveryRate < 0.95) score -= (0.95 - deliveryRate) * 100;
    score = Math.max(0, Math.min(100, score));

    Map<String, Object> metrics = new LinkedHashMap<>();
    metrics.put("sentCount", (int) sent);
    metrics.put("deliveredCount", (int) delivered);
    metrics.put("bounceCount", (int) bounce);
    metrics.put("complaintCount", (int) complaint);
    metrics.put("openCount", (int) opened);
    metrics.put("clickCount", (int) clicked);
    metrics.put("bounceRate", bounceRate);
    metrics.put("complaintRate", complaintRate);
    metrics.put("openRate", openRate);
    metrics.put("clickRate", clickRate);
    metrics.put("deliveryRate", deliveryRate);
    metrics.put("score", Math.round(score * 100.0) / 100.0);

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("windowHours", windowHours);
    body.put("metrics", metrics);
    return body;
  }
}
