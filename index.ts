import fs from 'fs';
import { htmlToText } from 'html-to-text';
import { ApolloClient, gql, HttpLink, InMemoryCache, isApolloError } from '@apollo/client/core';
import { fetch } from 'cross-fetch';
import FormData from 'form-data';
import axios from 'axios';
import qs from 'qs';

const authorizationHeaderValue = `Bearer ${process.env.AUTH_TOKEN}`;

// https://gitlab.com/snippets/1775781
export async function retry<T>(
  fn: () => Promise<T>,
  retriesLeft: number = 3,
  interval: number = 1000,
  exponential: boolean = false
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retriesLeft) {
      await new Promise(r => setTimeout(r, interval));
      return retry(
        fn,
        retriesLeft - 1,
        exponential ? interval * 2 : interval,
        exponential
      );
    } else throw new Error(`Max retries reached for function ${fn.name}`);
  }
}

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

const dataAsObject: { [oldId: string]: Datum } = JSON.parse(fs.readFileSync(`${__dirname}/storage/data.json`).toString());

const data = Object.values(dataAsObject);

let totalCreated = 0;

const createContent = async (datum: Datum) => {
  const query = `query MyQuery {
  image(where: {oldId: ${datum.id}}) {
    id
  }
}
`;
  const fetchResult = await client.query({
    query: gql`${query}`,
  });

  if (fetchResult.data.image?.id) {
    ++totalCreated;

    // This image was already created.
    console.info(`Already exists: ${totalCreated} out of ${data.length} image items.`);
    return;
  }


  const formData = new FormData();
  let imageUrl = `http://www.ruszkai.hu${datum.imageUrl}`;
  formData.append(
    'url',
    imageUrl,
  );

  const result = (await retry(() => axios.post<{id: string}>(
    `${process.env.GRAPHCMS_URL}/upload`,
    qs.stringify({url: imageUrl}),
    {
      headers: {
        'content-type': 'application/x-www-form-urlencoded;charset=utf-8',
        Authorization: authorizationHeaderValue,
      }}
  ))).data;
  const assetId: string = result.id;

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
  await retry(() => client.mutate({
    mutation: mutationQuery,
  }));

  ++totalCreated;

  console.info(`Successfully created ${totalCreated} out of ${data.length} image items.`);
};

async function execute() {
  try {
    for (const datum of data) {
      await createContent(datum);
    }

    console.info('Successfully created all of the images :)');
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
