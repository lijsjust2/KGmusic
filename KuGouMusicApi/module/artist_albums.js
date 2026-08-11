// 获取歌手专辑

module.exports = (params, useAxios) => {
  let sortValue = 3;
  if (params?.sort === 'new') {
    sortValue = 1;
  } else if (params?.sort === 'hot') {
    sortValue = 3;
  }

  const dataMap = {
    author_id: params.id,
    pagesize: params?.pagesize || 30,
    page: params?.page || 1,
    sort: sortValue,
    category: 1,
    area_code: 'all',
  };

  return useAxios({
    url: '/kmr/v1/author/albums',
    method: 'POST',
    data: dataMap,
    encryptType: 'android',
    cookie: params?.cookie || {},
    headers: { 'x-router': 'openapi.kugou.com', 'kg-tid': 36 },
  });
};
