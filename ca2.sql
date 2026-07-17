CREATE TABLE users (
    `id` int NOT NULL PRIMARY KEY AUTO_INCREMENT,
    `username` VARCHAR(20) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `password` VARCHAR(255) NOT NULL,
    `address` VARCHAR(255) NOT NULL,
    `contact` VARCHAR(10) NOT NULL,
    `role` VARCHAR(10) NOT NULL
);
