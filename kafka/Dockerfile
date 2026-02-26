FROM confluentinc/cp-kafka:7.0.1

# Copy the readiness probe into the image to avoid bind-mount interpreter/permission issues
# Use BuildKit's --chmod to set correct permissions during copy and avoid a separate RUN chmod.
COPY --chmod=0755 scripts/kafka-ready.sh /usr/local/bin/kafka-ready.sh

# Keep default entrypoint and command from the base image
