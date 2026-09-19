// Make sure no test can reach real AWS credentials or instance metadata.
for (const key of ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_PROFILE", "S3_ACCESS_KEY", "S3_SECRET_ACCESS_KEY"]) {
    delete process.env[key];
}
process.env.AWS_CONFIG_FILE = "/nonexistent/aws-config";
process.env.AWS_SHARED_CREDENTIALS_FILE = "/nonexistent/aws-credentials";
process.env.AWS_EC2_METADATA_DISABLED = "true";
