import fs from 'fs';
import { htmlToText } from 'html-to-text';
import {
  ApolloClient,
  InMemoryCache,
  gql,
  HttpLink,
  isApolloError,
} from '@apollo/client/core';
import { fetch } from 'cross-fetch';
import FormData from 'form-data';
import axios from 'axios';
import qs from 'qs';

const authorizationHeaderValue = `Bearer ${process.env.AUTH_TOKEN}`;

const client = new ApolloClient({
  link: new HttpLink({
    fetch,
    uri: process.env.GRAPHCMS_URL,
    headers: {
      Authorization: authorizationHeaderValue,
    },
  }),
  cache: new InMemoryCache()
});

type Datum = {
  id: number;
  imageUrl: string;
  title: string;
  imageAlt: string;
  imageWidth: number;
  imageHeight: number;
  descriptionHtml: string;
  imageData: string;
  taxonomyId: number;
}

const data: { [oldId: string]: Datum } = JSON.parse(fs.readFileSync(`${__dirname}/storage/data.json`).toString());

const datum = data[18];

const createContent = async (datum: Datum) => {
  const formData = new FormData();
  let imageUrl = `http://www.ruszkai.hu${datum.imageUrl}`;
  formData.append(
    'url',
    imageUrl,
  );

  const result = (await axios.post<{id: string}>(
    `${process.env.GRAPHCMS_URL}/upload`,
    qs.stringify({url: imageUrl}),
    {
      headers: {
        'content-type': 'application/x-www-form-urlencoded;charset=utf-8',
        Authorization: authorizationHeaderValue,
      }}
  )).data;
  const assetId: string = result.id;

  console.info(`Successfully uploaded image: ${JSON.stringify(result)}`);

  const mutationData = `{
      name: ${JSON.stringify(datum.title)},
      alt: ${JSON.stringify(datum.imageAlt)},
      image: {
        connect: {
          id: ${JSON.stringify(assetId)},
        }
      },
      taxonomy: {
        connect: {
          oldId: ${JSON.stringify(datum.taxonomyId)}
        }
      },
      oldId: ${JSON.stringify(datum.id)},
      body: ${JSON.stringify(htmlToText(datum.descriptionHtml))}
    }`;

  const queryBody = `mutation {createImage(data: ${mutationData}) { id }}`;

  let mutationQuery = gql`
      ${queryBody}
  `;
  console.info(queryBody);
  await client.mutate({
    mutation: mutationQuery,
  });
};

async function execute() {
  try {
    await createContent(datum);
  } catch (e: unknown) {
    if (e instanceof Error && isApolloError(e)) {
      console.error((e.name));
      console.error((e.graphQLErrors));
      console.error((e.extraInfo));
      console.error((e.message));
      console.error(JSON.stringify(e.networkError, null, 2));
    } else if (axios.isAxiosError(e)) {
      console.error(e.response?.data);
    } else {
      console.error(e);
    }
  }
}

execute();

//const mutation = `mutation MyMutation {
//  __typename
//  createImage(data: {name: ${JSON.stringify(datum.title)}, alt: ${JSON.stringify(datum.imageAlt)}, image: {create: {handle: ${JSON.stringify(datum.imageData)}, fileName: ${JSON.stringify(imageFilename)}}}, taxonomy: {connect: {oldId: ${JSON.stringify(datum.taxonomyId)}}}, body: ${JSON.stringify(htmlToText(datum.descriptionHtml))}})
//}
//`;
