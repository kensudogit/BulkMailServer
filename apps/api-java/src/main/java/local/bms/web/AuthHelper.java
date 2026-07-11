package local.bms.web;

import io.jsonwebtoken.Claims;
import jakarta.servlet.http.HttpServletRequest;
import local.bms.security.JwtService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
public class AuthHelper {
  private final JwtService jwtService;

  public AuthHelper(JwtService jwtService) {
    this.jwtService = jwtService;
  }

  public Claims requireUser(HttpServletRequest req) {
    String header = req.getHeader("Authorization");
    if (header == null || !header.startsWith("Bearer ")) {
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "unauthorized");
    }
    try {
      return jwtService.parse(header.substring(7));
    } catch (Exception e) {
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "invalid token");
    }
  }
}
