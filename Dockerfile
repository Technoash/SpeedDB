FROM node:10.15.0-alpine
EXPOSE 7000

WORKDIR /home/app

COPY serve/ /home/app

RUN npm install

CMD npm run start