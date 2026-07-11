package local.bms.web;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import local.bms.security.JwtService;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/auth")
@Validated
public class AuthController {
  private final JdbcTemplate jdbc;
  private final PasswordEncoder encoder;
  private final JwtService jwtService;
  private final AuthHelper authHelper;

  public AuthController(JdbcTemplate jdbc, PasswordEncoder encoder, JwtService jwtService, AuthHelper authHelper) {
    this.jdbc = jdbc;
    this.encoder = encoder;
    this.jwtService = jwtService;
    this.authHelper = authHelper;
  }

  public record LoginRequest(@Email String email, @NotBlank String password) {}

  @PostMapping("/login")
  public Map<String, Object> login(@RequestBody LoginRequest body) {
    var rows = jdbc.queryForList(
        "SELECT id, email, password_hash, name, role FROM users WHERE email=?",
        body.email());
    if (rows.isEmpty()) {
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "メールまたはパスワードが違います");
    }
    var u = rows.get(0);
    if (!encoder.matches(body.password(), String.valueOf(u.get("password_hash")))) {
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "メールまたはパスワードが違います");
    }
    UUID id = (UUID) u.get("id");
    String token = jwtService.issue(id, String.valueOf(u.get("email")), String.valueOf(u.get("role")), String.valueOf(u.get("name")));
    return Map.of(
        "token", token,
        "user", Map.of(
            "id", id.toString(),
            "email", u.get("email"),
            "role", u.get("role"),
            "name", u.get("name")));
  }

  @GetMapping("/me")
  public Map<String, Object> me(HttpServletRequest req) {
    var claims = authHelper.requireUser(req);
    return Map.of(
        "user",
        Map.of(
            "id", claims.getSubject(),
            "email", claims.get("email"),
            "role", claims.get("role"),
            "name", claims.get("name")));
  }
}
