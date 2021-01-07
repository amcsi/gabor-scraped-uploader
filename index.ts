import fs from 'fs';
import { htmlToText } from 'html-to-text';
import {
  ApolloClient,
  InMemoryCache,
  gql,
  HttpLink,
  isApolloError, ServerError,
} from '@apollo/client/core';
import { fetch } from 'cross-fetch';
import FormData from 'form-data';
import axios from 'axios';
import qs from 'qs';

const client = new ApolloClient({
  link: new HttpLink({ uri: process.env.GRAPHCMS_URL, fetch }),
  uri: process.env.GRAPHCMS_URL,
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

  const imageFilename = datum.imageUrl.split('/').reverse()[0];

  const formData = new FormData();
  let imageUrl = `http://www.ruszkai.hu${datum.imageUrl}`;
  formData.append(
    'url',
    imageUrl,
  );

  let requestInfo: Partial<RequestInfo> = {
    method: 'POST',
  };
  console.info(requestInfo);
  const result = (await axios.post<{id: string}>(
    `${process.env.GRAPHCMS_URL}/upload`,
    qs.stringify({url: imageUrl}),
    {
      headers: {
        'content-type': 'application/x-www-form-urlencoded;charset=utf-8',
        Authorization: `Bearer ${process.env.AUTH_TOKEN}`,
      }}
  )).data;
  const assetId: string = result.id;

  console.info(`Successfully uploaded image: ${JSON.stringify(result)}`);

  const mutationData = `{
      name: ${JSON.stringify(datum.title)},
      alt: ${JSON.stringify(datum.imageAlt)},
      image: {
        create: {
          handle: ${JSON.stringify(imageUrl)},
          fileName: ${JSON.stringify(imageFilename)}
        }
      },
      taxonomy: {
        connect: {
          oldId: ${JSON.stringify(datum.taxonomyId)}
        }
      },
      body: ${JSON.stringify(htmlToText(datum.descriptionHtml))}
    }`;

  let mutationQuery = gql`
      mutation {createImage(data: ${mutationData})}
  `;
  console.info(mutationQuery);
  const mutationResult = await client.mutate({
    mutation: mutationQuery,
  });
};

async function execute() {
  try {
    await createContent(datum);
  } catch (e: unknown) {
    if (e instanceof Error && isApolloError(e)) {
      console.error((e.networkError as ServerError).result);
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
