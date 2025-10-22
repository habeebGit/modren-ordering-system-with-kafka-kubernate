up:
    docker-compose up --build

down:
    docker-compose down

logs:
    docker-compose logs -f

test-order-service:
    cd order-service && npm test

test-product-service:
    cd product-service && npm test

clean:
    docker-compose down -v