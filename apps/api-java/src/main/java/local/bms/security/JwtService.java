package local.bms.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.Map;
import java.util.UUID;

@Component
public class JwtService {
  private final SecretKey key;

  public JwtService(@Value("${bms.jwt-secret}") String secret) {
    this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
  }

  public String issue(UUID userId, String email, String role, String name) {
    Instant now = Instant.now();
    return Jwts.builder()
        .subject(userId.toString())
        .claims(Map.of("email", email, "role", role, "name", name))
        .issuedAt(Date.from(now))
        .expiration(Date.from(now.plusSeconds(12 * 3600)))
        .signWith(key)
        .compact();
  }

  public Claims parse(String token) {
    return Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload();
  }
}
