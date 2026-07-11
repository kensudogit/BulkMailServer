package local.bms.config;

import org.springframework.amqp.core.Queue;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.jdbc.DataSourceBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import javax.sql.DataSource;

@Configuration
public class DataSourceConfig {
  /**
   * DATABASE_URL が postgresql:// 形式でも jdbc:postgresql:// に正規化する
   */
  @Bean
  public DataSource dataSource(
      @Value("${spring.datasource.url}") String url,
      @Value("${spring.datasource.username}") String username,
      @Value("${spring.datasource.password}") String password) {
    String jdbcUrl = url;
    if (jdbcUrl.startsWith("postgresql://")) {
      jdbcUrl = "jdbc:" + jdbcUrl;
    }
    return DataSourceBuilder.create().url(jdbcUrl).username(username).password(password).build();
  }

  @Bean
  public Queue sendQueue(@Value("${bms.queue-send}") String name) {
    return new Queue(name, true);
  }
}
